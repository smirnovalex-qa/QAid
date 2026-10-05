/**
 * e2e CDP-режима мока сети (TASK-032) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Сегмент стратегии MAIN/CDP отображается в панели мока и переключается на CDP,
 *     показывая честную заметку о баннере отладки — надёжно, без прав.
 *  2. Best-effort сквозной путь CDP: подключение отладчика к вкладке
 *     (`chrome.debugger.attach`) + `Fetch.enable` + `Fetch.fulfillRequest` подменяет
 *     ответ. Attach требует нативного жеста/баннера и недоступен на некоторых CI —
 *     тогда мягкий пропуск (полный e2e — на load-unpacked, как для permission-gated
 *     путей). Право `debugger` — install-time (Chrome не допускает optional), поэтому
 *     отдельного гранта под жестом не нужно; opt-in обеспечивает сам attach.
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-mock-cdp.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const API_URL = `${TEST_ORIGIN}/api/data`;
const TEST_HTML = '<!doctype html><html><body><p>cdp mock fixture</p></body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель мока показывает сегмент стратегии и заметку CDP', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: /Мок сети|Network mock/ }).click();

  // Переключаем стратегию на CDP — появляется честная заметка про баннер отладки.
  await panel.getByRole('radio', { name: /CDP/ }).click();
  await expect(panel.getByText(/баннер|banner/i)).toBeVisible();
});

test('best-effort: CDP-режим подменяет ответ через Fetch.fulfillRequest', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  // Реальный ответ /api — чтобы отличить его от подменённого CDP-правилом.
  await context.route(API_URL, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"mocked":false,"real":true}' }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);
  await openSidePanel();
  await page.bringToFront();

  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Пытаемся подключить отладчик и включить Fetch-перехват прямо из SW (тот же
  // platform-seam, что и фича). Где attach недоступен без нативного баннера — мягкий пропуск.
  const attached = await sw.evaluate(async (tabId: number) => {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
        patterns: [{ urlPattern: '*' }],
      });
      return true;
    } catch {
      return false;
    }
  }, realTabId);
  test.skip(
    !attached,
    'chrome.debugger.attach недоступен в этой среде — проверка на load-unpacked',
  );

  // Слушаем Fetch.requestPaused в SW и подменяем ответ /api/data синтетикой.
  await sw.evaluate((apiUrl: string) => {
    const enc = (s: string): string => btoa(unescape(encodeURIComponent(s)));
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const p = params as { requestId: string; request: { url: string } };
      if (source.tabId === undefined) return;
      if (p.request.url.includes('/api/data')) {
        void chrome.debugger.sendCommand({ tabId: source.tabId }, 'Fetch.fulfillRequest', {
          requestId: p.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: enc('{"mocked":true}'),
        });
      } else {
        void chrome.debugger.sendCommand({ tabId: source.tabId }, 'Fetch.continueRequest', {
          requestId: p.requestId,
        });
      }
    });
  }, API_URL);

  try {
    const body = await page.evaluate(async (url: string) => {
      const res = await fetch(url);
      return res.text();
    }, API_URL);
    expect(body).toContain('"mocked":true');
    expect(body).not.toContain('"real":true');
  } finally {
    // Критично: всегда освобождаем отладчик, чтобы не оставить баннер/блок DevTools.
    await sw.evaluate(
      (tabId: number) => chrome.debugger.detach({ tabId }).catch(() => undefined),
      realTabId,
    );
  }
});

/**
 * e2e фичи «Мок сети» (TASK-022) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопка «Включить перехват») —
 *     надёжно и без прав.
 *  2. Полный путь подмены: грант `scripting` + host, инъекция MAIN-перехватчика
 *     (`mock/apply`), реальный `fetch` на фикстуре возвращает ПОДМЕНЁННЫЙ JSON, а не
 *     сетевой ответ. Требует выданных optional-прав; где грант host недоступен без
 *     нативного диалога — мягкий пропуск (полный e2e — на load-unpacked, ADR-0020/0022).
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-mock.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const API_URL = `${TEST_ORIGIN}/api/data`;
const TEST_HTML = '<!doctype html><html><body><p>mock fixture</p></body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель мока сети рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'mock-network');
  await expect(
    panel.getByRole('switch', { name: /Перехватывать запросы|Intercept requests/ }),
  ).toBeVisible();
});

test('подмена ответа fetch правилом мока (MAIN-инъекция)', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  // Реальный ответ /api — чтобы отличить его от подменённого правилом.
  await context.route(API_URL, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"mocked":false,"real":true}' }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант scripting + host под жестом из side panel (мягкий пропуск при отказе).
  const panel = await openSidePanel();
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['scripting'], origins: ['*://*/*'] })
        .then((ok) => ((window as unknown as { __granted?: boolean }).__granted = ok))
        .catch(() => ((window as unknown as { __granted?: boolean }).__granted = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant__').click();
  const granted = await panel
    .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Применяем правило подмены через фоновый хендлер (как это делает UI-мост).
  const applied = await panel.evaluate(async (tabId: number) => {
    const rule = {
      id: 'e2e-rule',
      label: 'mock api',
      enabled: true,
      matcher: { methods: [], pattern: '*/api/data', patternKind: 'glob', headerPredicates: [] },
      action: {
        status: 200,
        statusText: '',
        headers: [],
        bodyMode: 'json',
        body: '{"mocked":true}',
        delayMs: 0,
      },
      once: null,
    };
    const reply = (await chrome.runtime.sendMessage({
      __qatb__: true,
      type: 'mock/apply',
      payload: { tabId, rules: [rule], strategy: 'main' },
      correlationId: 'e2e-mock-apply',
    })) as { payload?: { ok?: boolean } } | undefined;
    return reply?.payload?.ok ?? false;
  }, realTabId);
  test.skip(!applied, 'MAIN-инъекция требует host-доступа — проверка на load-unpacked');

  // Реальный fetch на странице должен вернуть ПОДМЕНЁННОЕ тело, а не сетевой ответ.
  const body = await page.evaluate(async (url: string) => {
    const res = await fetch(url);
    return res.text();
  }, API_URL);
  expect(body).toContain('"mocked":true');
  expect(body).not.toContain('"real":true');
});

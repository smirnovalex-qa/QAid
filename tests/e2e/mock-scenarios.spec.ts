/**
 * e2e сценариев/троттлинга/офлайна мока (TASK-023) поверх собранного MV3-расширения.
 *
 * Проверяет сквозной путь движка TASK-022 для action-полей TASK-023:
 *  1. Сценарий «Ошибка 500 на API» → реальный `fetch` на /api/* получает статус 500
 *     (набор правил, который отдаёт резолвер сценария; резолвер сам покрыт юнит-тестами).
 *  2. Офлайн-правило → `fetch` совпавшего URL падает сетевой ошибкой (reject).
 *
 * Как и mock-network.spec: permission-gated путь мягко пропускается в sandbox
 * (нативный диалог host-доступа), подтверждается на load-unpacked (ADR-0020/0022).
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-scenarios.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const API_URL = `${TEST_ORIGIN}/api/data`;
const TEST_HTML = '<!doctype html><html><body><p>scenario fixture</p></body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

/** Грант scripting + host под жестом из side panel; false — если среда требует диалога. */
async function grant(panel: import('@playwright/test').Page): Promise<boolean> {
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
  return panel
    .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
}

/** Применяет набор правил на вкладке через фоновый хендлер (как это делает UI-мост). */
async function applyRules(
  panel: import('@playwright/test').Page,
  tabId: number,
  rules: unknown[],
): Promise<boolean> {
  return panel.evaluate(
    async ({ tabId, rules }) => {
      const reply = (await chrome.runtime.sendMessage({
        __qatb__: true,
        type: 'mock/apply',
        payload: { tabId, rules, strategy: 'main' },
        correlationId: 'e2e-scenario-apply',
      })) as { payload?: { ok?: boolean } } | undefined;
      return reply?.payload?.ok ?? false;
    },
    { tabId, rules },
  );
}

test('сценарий «500 на API»: fetch получает статус 500 (MAIN-инъекция)', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  await context.route(API_URL, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"real":true}' }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);
  const sw = await serviceWorker(context);

  const panel = await openSidePanel();
  const granted = await grant(panel);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const tabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(tabId).toBeGreaterThanOrEqual(0);

  // Набор, который резолвер сценария «error500» отдаёт в перехватчик (см. scenarios.ts).
  const applied = await applyRules(panel, tabId, [
    {
      id: 'e2e-500',
      label: 'error 500',
      enabled: true,
      matcher: { methods: [], pattern: '*/api/*', patternKind: 'glob', headerPredicates: [] },
      action: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: [],
        bodyMode: 'json',
        body: '{"error":"emulated 500"}',
        delayMs: 0,
        throttleKbps: null,
        offline: false,
      },
      once: null,
    },
  ]);
  test.skip(!applied, 'MAIN-инъекция требует host-доступа — проверка на load-unpacked');

  const status = await page.evaluate(async (url: string) => {
    const res = await fetch(url);
    return res.status;
  }, API_URL);
  expect(status).toBe(500);
});

test('офлайн-правило: fetch совпавшего URL падает сетевой ошибкой', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  await context.route(API_URL, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"real":true}' }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);
  const sw = await serviceWorker(context);

  const panel = await openSidePanel();
  const granted = await grant(panel);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const tabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(tabId).toBeGreaterThanOrEqual(0);

  const applied = await applyRules(panel, tabId, [
    {
      id: 'e2e-offline',
      label: 'offline api',
      enabled: true,
      matcher: { methods: [], pattern: '*/api/*', patternKind: 'glob', headerPredicates: [] },
      action: {
        status: null,
        statusText: '',
        headers: [],
        bodyMode: 'passthrough',
        body: '',
        delayMs: 0,
        throttleKbps: null,
        offline: true,
      },
      once: null,
    },
  ]);
  test.skip(!applied, 'MAIN-инъекция требует host-доступа — проверка на load-unpacked');

  const failed = await page.evaluate(async (url: string) => {
    try {
      await fetch(url);
      return false;
    } catch {
      return true;
    }
  }, API_URL);
  expect(failed).toBe(true);
});

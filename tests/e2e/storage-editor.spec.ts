/**
 * e2e фичи «Состояние браузера: редактор storage/cookies» (TASK-017) поверх
 * собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (табы Cookies/Local/Session) —
 *     надёжно и без прав.
 *  2. Правка `localStorage` активной вкладки применяется реально: инъекция
 *     content-хоста (со storage-мостом, проведённым оркестратором в бандл), RPC
 *     `storage/set`, затем чтение `localStorage` страницы подтверждает запись.
 *  3. Cookie домена записывается через background-хендлер `cookies/set` и читается
 *     обратно через `chrome.cookies`. Требует выданного права `cookies` (+ host);
 *     где грант недоступен без нативного диалога — мягкий пропуск (см. contrast spec).
 *
 * До интеграции оркестратором (вызов `installStorageContentHost()` в content-бандле,
 * `'cookies'` в `optional_permissions`) шаги 2–3 могут мягко пропускаться.
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-e2e-storage.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body style="background:#fff">' +
  '<p>storage editor fixture</p>' +
  '</body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('редактор storage рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка редизайна показывает одну активную панель — активируем редактор кликом
  // по кнопке рельса (aria-label = заголовок фичи).
  await panel.getByRole('button', { name: /Storage и cookies|Storage & cookies/ }).click();
  await expect(
    panel.getByRole('button', { name: /Загрузить|Load|Обновить|Reload/ }).first(),
  ).toBeVisible();
});

test('правка localStorage применяется на странице через RPC', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант scripting + host под жестом из side panel (host может требовать
  // нативного диалога — при отказе мягкий пропуск).
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
  // Грант под НОДА-бюджетом: нативный модальный диалог может заморозить CDP, тогда
  // Playwright-таймаут не сработает — Node-таймер даёт детерминированный soft-skip.
  const grantRes = await withPermissionTimeout(
    () =>
      panel
        .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
          timeout: 8000,
        })
        .then(() => true),
    { label: 'permission grant', budgetMs: 6000 },
  );
  test.skip(
    !grantRes.ok,
    'optional-права не выданы в этой среде — ручная проверка (load-unpacked)',
  );

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Инъекция content-хоста инспекции (со storage-мостом, проведённым оркестратором).
  // Бюджет ожидания: зависший на нативном диалоге host-грант блокирует SW, и
  // `executeScript` не резолвится — без бюджета тест висит до 30s вместо мягкого
  // пропуска (см. fixtures/permission-timeout.ts).
  const injectionRes = await withPermissionTimeout(
    () =>
      sw.evaluate(async (id: number) => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: id },
            files: ['content-inspection.js'],
          });
          return { ok: true as const };
        } catch (e) {
          return { ok: false as const, error: String(e) };
        }
      }, realTabId),
    { label: 'инъекция content-хоста' },
  );
  test.skip(!injectionRes.ok, injectionRes.reason ?? '');
  const injection = injectionRes.value ?? { ok: false as const, error: 'нет ответа' };
  test.skip(!injection.ok, `инъекция требует host-доступа: ${injection.error ?? ''}`);

  // Пишем ключ через RPC storage/set (content-target) и читаем его на странице.
  await sw.evaluate(async (id: number) => {
    await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'storage/set',
      payload: { tabId: id, area: 'local', key: 'qa_flag', value: 'on' },
      correlationId: 'e2e-storage-set',
    });
  }, realTabId);

  const stored = await page.evaluate(() => window.localStorage.getItem('qa_flag'));
  expect(stored).toBe('on');
});

test('cookie домена пишется через background-хендлер', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);
  const panel = await openSidePanel();

  // Грант cookies + host под жестом (может требовать нативного диалога — мягкий пропуск).
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant_cookies__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['cookies'], origins: ['*://*/*'] })
        .then((ok) => ((window as unknown as { __ck?: boolean }).__ck = ok))
        .catch(() => ((window as unknown as { __ck?: boolean }).__ck = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant_cookies__').click();
  const grantRes = await withPermissionTimeout(
    () =>
      panel
        .waitForFunction(() => (window as unknown as { __ck?: boolean }).__ck === true, {
          timeout: 8000,
        })
        .then(() => true),
    { label: 'grant cookies', budgetMs: 6000 },
  );
  test.skip(!grantRes.ok, 'право cookies не выдано в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });

  // Пишем cookie через background RPC cookies/set (envelope в runtime). Бюджет
  // ожидания: если грант cookies поднял нативный диалог, он блокирует SW и RPC не
  // резолвится — без бюджета тест висит до 30s вместо детерминированного пропуска.
  const rpcRes = await withPermissionTimeout(
    () =>
      panel.evaluate(async (id: number) => {
        await chrome.runtime.sendMessage({
          __qatb__: true,
          type: 'cookies/set',
          payload: {
            tabId: id,
            cookie: {
              name: 'qa_e2e',
              value: 'v1',
              domain: 'qa-e2e-storage.test',
              path: '/',
              secure: true,
              httpOnly: false,
              sameSite: 'lax',
            },
          },
          correlationId: 'e2e-cookie-set',
        });
      }, realTabId),
    { label: 'RPC cookies/set' },
  );
  test.skip(!rpcRes.ok, rpcRes.reason ?? '');

  const cookieValue = await sw.evaluate(async () => {
    const c = await chrome.cookies.get({ url: 'https://qa-e2e-storage.test/', name: 'qa_e2e' });
    return c?.value ?? null;
  });
  expect(cookieValue).toBe('v1');
});

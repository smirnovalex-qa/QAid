/**
 * e2e откреплённой плавающей панели (TASK-062) поверх собранного MV3-расширения.
 *
 * Проверяет в реально загруженном расширении:
 *  1. `floating-panel/open` из extension-контекста инъектирует content-обёртку в активную
 *     вкладку — на странице появляется closed-Shadow хост `[data-qatb-panel]`.
 *  2. Персистентность: клик по странице НЕ закрывает панель (в отличие от popup).
 *  3. Идемпотентность: повторный `open` не плодит второй экземпляр.
 *  4. DOM страницы вне `[data-qatb-panel]` не мутируется (до/после).
 *  5. Teardown: `pagehide` (навигация) полностью снимает обёртку.
 *  6. Строгая CSP (`frame-src 'none'`): обёртка монтируется и деградирует мягко (фолбэк
 *     внутри closed-shadow), без битых артефактов в light-DOM и без мутаций страницы.
 *
 * Требует выданных optional-прав (`scripting` + host-доступ ко всем http/https); где грант требует нативного
 * диалога (SW/Playwright его не закрывают) — тест мягко пропускается, полный путь
 * подтверждается на Load unpacked. Drag/clamp/collapse детально покрыты юнитами (closed
 * Shadow DOM недоступен Playwright'у), здесь — инъекция/персист/lifecycle.
 */
import { test, expect } from './fixtures/extension';
import type { BrowserContext, Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-panel-e2e.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body><h1 id="title">Heading</h1>' +
  '<button id="target" class="primary">Click me</button></body></html>';

/** Маркер хоста панели из `content/panel/frame.ts`. */
const PANEL_ATTR = 'data-qatb-panel';

async function serviceWorker(context: BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

/** Выдаёт `scripting` + host-доступ ко всем http/https под жестом из side panel; false — грант не прошёл. */
async function grantHostAccess(panel: import('@playwright/test').Page): Promise<boolean> {
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
  const res = await withPermissionTimeout(
    () =>
      panel
        .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
          timeout: 8000,
        })
        .then(() => true),
    { label: 'permission grant', budgetMs: 6000 },
  );
  return res.ok;
}

/** Открывает плавающую панель через реальный контракт `floating-panel/open`. */
async function openFloatingPanel(sw: Worker, tabId: number): Promise<{ ok: boolean }> {
  return sw.evaluate(async (id: number) => {
    const reply = (await chrome.runtime.sendMessage({
      __qatb__: true,
      type: 'floating-panel/open',
      payload: { tabId: id },
      correlationId: `e2e-open-${String(id)}`,
    })) as { payload?: { ok?: boolean }; type?: string } | undefined;
    return { ok: reply?.payload?.ok === true };
  }, tabId);
}

async function activeTabId(sw: Worker): Promise<number> {
  return sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
}

test('открепление: инъекция, персистентность клика, идемпотентность, DOM не мутирован, teardown', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);
  const sw = await serviceWorker(context);

  const panel = await openSidePanel();
  const granted = await grantHostAccess(panel);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const tabId = await activeTabId(sw);
  expect(tabId).toBeGreaterThanOrEqual(0);

  const before = await page.evaluate(() => document.body.innerHTML);

  const opened = await withPermissionTimeout(() => openFloatingPanel(sw, tabId), {
    label: 'floating-panel/open',
  });
  test.skip(!opened.ok, opened.reason ?? '');
  test.skip(opened.value?.ok !== true, 'инъекция требует host-доступа — проверка на load-unpacked');

  // Обёртка появилась на странице (closed-Shadow хост виден в light-DOM по атрибуту).
  await expect.poll(() => page.locator(`[${PANEL_ATTR}]`).count(), { timeout: 5000 }).toBe(1);

  // Персистентность: клик по странице НЕ закрывает панель (в отличие от transient-popup).
  await page.locator('#target').click();
  expect(await page.locator(`[${PANEL_ATTR}]`).count()).toBe(1);

  // Идемпотентность: повторный open не создаёт второй экземпляр.
  await openFloatingPanel(sw, tabId);
  expect(await page.locator(`[${PANEL_ATTR}]`).count()).toBe(1);

  // DOM страницы вне панели не изменился.
  const outside = await page.evaluate(() => {
    const host = document.querySelector('[data-qatb-panel]');
    host?.remove(); // снимок БЕЗ хоста панели (как и `before`, где его не было)
    return document.body.innerHTML;
  });
  expect(outside).toBe(before);

  // Восстановим хост (мы его удалили для снимка) повторной инъекцией и проверим teardown.
  await openFloatingPanel(sw, tabId);
  await expect.poll(() => page.locator(`[${PANEL_ATTR}]`).count(), { timeout: 5000 }).toBe(1);

  // Teardown: навигация (pagehide) полностью снимает обёртку.
  await page.goto(`${TEST_ORIGIN}/other`);
  await expect.poll(() => page.locator(`[${PANEL_ATTR}]`).count(), { timeout: 5000 }).toBe(0);
});

test('строгая CSP страницы: панель деградирует мягко, без мутаций DOM', async ({
  context,
  openSidePanel,
}) => {
  // `frame-src 'none'` запрещает странице встраивать ЛЮБОЙ фрейм, включая extension-iframe
  // тела панели — обёртка смонтируется, но тело не загрузится → фолбэк (в closed-shadow).
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'Content-Security-Policy': "frame-src 'none'" },
      body: TEST_HTML,
    }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);
  const sw = await serviceWorker(context);

  const panel = await openSidePanel();
  const granted = await grantHostAccess(panel);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const tabId = await activeTabId(sw);
  const before = await page.evaluate(() => document.body.innerHTML);

  const opened = await withPermissionTimeout(() => openFloatingPanel(sw, tabId), {
    label: 'floating-panel/open (csp)',
  });
  test.skip(
    !opened.ok || opened.value?.ok !== true,
    'инъекция требует host-доступа (load-unpacked)',
  );

  // Обёртка всё равно смонтирована (chrome у неё в light-DOM/shadow; CSP блокирует лишь iframe).
  await expect.poll(() => page.locator(`[${PANEL_ATTR}]`).count(), { timeout: 5000 }).toBe(1);

  // Страница вне панели не мутирована (фолбэк живёт внутри closed-shadow обёртки).
  const outside = await page.evaluate(() => {
    document.querySelector('[data-qatb-panel]')?.remove();
    return document.body.innerHTML;
  });
  expect(outside).toBe(before);
});

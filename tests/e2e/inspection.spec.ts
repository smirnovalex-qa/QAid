/**
 * e2e эталонного инспектора (TASK-013) поверх собранного MV3-расширения.
 *
 * Проверяет две вещи в реально загруженном расширении:
 *  1. Инспектор регистрируется и рендерится в side panel (UI end-to-end через
 *     реестр фич) — надёжно и без прав.
 *  2. Инъектируемый content-хост (`content-inspection.js`) работает в реальной
 *     странице: инъекция `chrome.scripting`, RPC-раунд-трип, пикер, оверлей в
 *     Shadow DOM появляется и снимается, DOM страницы не мутируется, возвращается
 *     tagName. Требует выданных optional-прав (`scripting` + host-доступ ко всем
 *     http/https-страницам); в средах, где грант host недоступен без нативного
 *     диалога, тест мягко пропускается — e2e-инъекция подтверждается на Load
 *     unpacked (см. PROGRESS/ADR-0020/ADR-0022).
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

/** Тестовый origin: перехватывается Playwright'ом (сервер не нужен), грантится как host. */
const TEST_ORIGIN = 'https://qa-e2e.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body><h1 id="title">Heading</h1>' +
  '<button id="target" class="primary big">Click me</button></body></html>';

/** Маркер оверлея из `content/inspection/overlay.ts`. */
const OVERLAY_ATTR = 'data-qatb-overlay';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('инспектор рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка редизайна показывает одну активную панель — активируем инспектор элемента
  // кликом по кнопке рельса (aria-label = заголовок фичи).
  await panel.getByRole('button', { name: /Инспектор элемента|Element inspector/ }).click();
  await expect(panel.getByRole('button', { name: /Выбрать элемент|Pick element/ })).toBeVisible();
});

test('пикер end-to-end: инъекция, оверлей, tagName, DOM не мутирован', async ({
  context,
  openSidePanel,
}) => {
  // Тестовую страницу отдаём перехватом запроса (без реального сервера), чтобы у
  // неё был грантируемый http(s)-origin (в отличие от data:, куда инъекция закрыта).
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Выдаём `scripting` + постоянный host-доступ (`*://*/*`) под пользовательским
  // жестом из side panel (extension-контекст, где доступен chrome.permissions).
  // Постоянный host — в отличие от `activeTab` — переживает переключение вкладок
  // (ADR-0022), поэтому инъекция ниже адресует вкладку-страницу независимо от
  // action-инвокации. Запрос host может требовать нативного диалога, который
  // SW/Playwright не закрывают: при отказе/таймауте тест мягко пропускается — полный
  // e2e инъекции подтверждается на Load unpacked (см. PROGRESS/ADR-0020/ADR-0022).
  // Юнит-тесты покрывают менеджер инъекции, хост, пикер, оверлей и форвардинг детально.
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
  // Грант под НОДА-бюджетом (см. fixtures/permission-timeout.ts): нативный модальный
  // диалог может заморозить CDP, тогда Playwright-таймаут не сработает — Node-таймер
  // даёт детерминированный soft-skip вместо 30s-зависания.
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

  // Реальный tabId вкладки-страницы: выводим её на передний план и берём id
  // активной вкладки (id доступен без права `tabs`).
  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Снимок DOM до инспекции (вне оверлея).
  const before = await page.evaluate(() => document.body.innerHTML);

  // Инъекция content-хоста. Без host-доступа к вкладке (см. выше) — мягкий пропуск.
  // Ограничиваем ожидание бюджетом: если грант host поднял нативный диалог, он
  // блокирует SW и `executeScript` не резолвится — без бюджета зависший вызов тянет
  // тест до 30s-таймаута Playwright вместо детерминированного мягкого пропуска.
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
  test.skip(
    !injection.ok,
    `инъекция требует выданного host-доступа (*://*/*); грант host мог не пройти без нативного диалога: ${injection.error ?? ''} — проверка на load-unpacked`,
  );

  // Хост поднялся и отвечает на ping.
  const ready = await sw.evaluate(async (id: number) => {
    const reply = (await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'inspection/ping',
      payload: {},
      correlationId: 'e2e-ping',
    })) as { type?: string } | undefined;
    return reply?.type === 'inspection/ping';
  }, realTabId);
  expect(ready).toBe(true);

  // Запускаем пикер и параллельно кликаем по кнопке страницы.
  const pickPromise = sw.evaluate(async (id: number) => {
    const reply = (await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'inspection/pick',
      payload: { tabId: id },
      correlationId: 'e2e-pick',
    })) as { payload?: { tagName?: string } } | undefined;
    return reply?.payload?.tagName;
  }, realTabId);

  // Оверлей появился в Shadow DOM хоста.
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBeGreaterThan(0);

  // Кликаем по элементу — пикер должен выбрать button.
  await page.locator('#target').click();
  const tagName = await pickPromise;
  expect(tagName).toBe('button');

  // Снимаем оверлей.
  await sw.evaluate(async (id: number) => {
    await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'inspection/teardown',
      payload: { tabId: id },
      correlationId: 'e2e-teardown',
    });
  }, realTabId);
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBe(0);

  // DOM страницы вне оверлея не изменился.
  const after = await page.evaluate(() => document.body.innerHTML);
  expect(after).toBe(before);
});

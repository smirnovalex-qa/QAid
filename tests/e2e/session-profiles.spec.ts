/**
 * e2e фичи «Профили сессий» (TASK-047) поверх собранного MV3-расширения.
 *
 * Что проверяется и почему:
 *  1. Фича регистрируется и рендерится в side panel — надёжно и без всяких прав.
 *     Активируем панель кликом по кнопке рельса (aria-label = заголовок фичи) и
 *     убеждаемся, что виден контрол захвата профиля. Этот тест обязан проходить в
 *     CI без единого гранта.
 *  2. Горячая смена профиля (hot-swap) реально применяет состояние к странице.
 *     Профиль сессии = cookies + localStorage + sessionStorage конкретного сайта;
 *     смена профиля = «прунинг устаревшего → применение целевого → перезагрузка
 *     вкладки». У фичи НЕТ собственного RPC: она оркеструет уже существующие
 *     переиспользуемые сеймы платформы — тот же `storage/set` (content-target),
 *     что и у редактора storage, тот же `cookies/set` (background-target), и
 *     обязательный `chrome.tabs.reload` (сейм платформы оборачивает reload).
 *     Поэтому здесь мы воспроизводим ЭФФЕКТ смены целевого профиля из тех же
 *     кирпичей: инъекция content-хоста инспекции → seed целевого localStorage
 *     через `storage/set` → seed целевого cookie через `cookies/set` →
 *     перезагрузка вкладки → чтение localStorage страницы и cookie домена
 *     обратно. Так подтверждается сквозной путь swap'а, который фича собирает.
 *
 * Почему шаг 2 может мягко пропускаться (test.skip) в headless CI:
 *  - Гранты optional-прав (scripting + cookies + host для всех origin) под
 *    синтетическим жестом в панели могут поднять НАТИВНЫЙ модальный диалог. Он
 *    замораживает CDP, из-за чего даже Playwright-таймаут не сработает — ждём
 *    под НОДА-бюджетом `withPermissionTimeout` и при отказе делаем soft-skip.
 *  - Инъекция `content-inspection.js` через `chrome.scripting.executeScript`
 *    требует реального host-доступа; зависший на диалоге грант блокирует SW и
 *    вызов не резолвится — тоже под бюджетом с мягким пропуском.
 *  Полная сквозная проверка гарантируется на load-unpacked (ADR-0026).
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-e2e-sessprofiles.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body style="background:#fff">' +
  '<p>session profiles fixture</p>' +
  '</body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель профилей сессий рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка редизайна показывает одну активную панель — активируем фичу кликом
  // по кнопке рельса (aria-label = заголовок фичи).
  await openTool(panel, 'session-profiles');
  // Контрол сохранения профиля виден без каких-либо прав.
  await expect(
    panel.getByRole('button', { name: /Сохранить текущий вход|Save current login/ }).first(),
  ).toBeVisible();
});

test('hot-swap применяет целевое состояние к странице', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант scripting + cookies + host под синтетическим жестом из side panel
  // (host/cookies могут требовать нативного диалога — при отказе мягкий пропуск).
  const panel = await openSidePanel();
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant_sess__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['scripting', 'cookies'], origins: ['*://*/*'] })
        .then((ok) => ((window as unknown as { __sess?: boolean }).__sess = ok))
        .catch(() => ((window as unknown as { __sess?: boolean }).__sess = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant_sess__').click();
  // Грант под НОДА-бюджетом: нативный модальный диалог может заморозить CDP, тогда
  // Playwright-таймаут не сработает — Node-таймер даёт детерминированный soft-skip.
  const grantRes = await withPermissionTimeout(
    () =>
      panel
        .waitForFunction(() => (window as unknown as { __sess?: boolean }).__sess === true, {
          timeout: 8000,
        })
        .then(() => true),
    { label: 'grant scripting+cookies+host', budgetMs: 6000 },
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

  // Seed «целевого профиля»: localStorage через RPC storage/set (content-target).
  await sw.evaluate(async (id: number) => {
    await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'storage/set',
      payload: { tabId: id, area: 'local', key: 'qa_session', value: 'admin' },
      correlationId: 'e2e-sessprofile-storage-set',
    });
  }, realTabId);

  // Seed «целевого профиля»: cookie домена через background RPC cookies/set. Бюджет:
  // если грант cookies поднял нативный диалог, он блокирует SW и RPC не резолвится —
  // без бюджета тест висит до 30s вместо детерминированного пропуска.
  const cookieRes = await withPermissionTimeout(
    () =>
      panel.evaluate(async (id: number) => {
        await chrome.runtime.sendMessage({
          __qatb__: true,
          type: 'cookies/set',
          payload: {
            tabId: id,
            cookie: {
              name: 'qa_sess',
              value: 'admin',
              domain: 'qa-e2e-sessprofiles.test',
              path: '/',
              secure: true,
              httpOnly: false,
              sameSite: 'lax',
            },
          },
          correlationId: 'e2e-sessprofile-cookie-set',
        });
      }, realTabId),
    { label: 'RPC cookies/set' },
  );
  test.skip(!cookieRes.ok, cookieRes.reason ?? '');

  // Обязательная перезагрузка вкладки — тот же сейм платформы, что оборачивает
  // `chrome.tabs.reload` в фиче hot-swap'а. Под бюджетом на случай блока диалогом.
  // `chrome.tabs.reload` из SW не дожидается загрузки — ждём событие `load` страницы,
  // иначе `page.evaluate` ниже ловит момент навигации («execution context destroyed»).
  const reloadRes = await withPermissionTimeout(
    () =>
      Promise.all([
        page.waitForEvent('load'),
        sw.evaluate((id: number) => chrome.tabs.reload(id), realTabId),
      ]).then(() => undefined),
    { label: 'chrome.tabs.reload' },
  );
  test.skip(!reloadRes.ok, reloadRes.reason ?? '');

  // После перезагрузки целевое состояние присутствует на странице/в куках.
  const stored = await page.evaluate(() => window.localStorage.getItem('qa_session'));
  expect(stored).toBe('admin');

  const cookieValue = await sw.evaluate(async () => {
    const c = await chrome.cookies.get({
      url: 'https://qa-e2e-sessprofiles.test/',
      name: 'qa_sess',
    });
    return c?.value ?? null;
  });
  expect(cookieValue).toBe('admin');
});

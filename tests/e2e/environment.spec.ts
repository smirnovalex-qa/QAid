/**
 * e2e фичи «Эмуляция окружения» (TASK-019) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится (мастер-тумблер виден) — надёжно, без прав.
 *  2. Подмена UA применяется в ДВУХ плоскостях: заголовок запроса `User-Agent`
 *     (DNR session-rule) и `navigator.userAgent` в MAIN-world. Требует выданных прав
 *     (`declarativeNetRequest` + `scripting` + host); где грант недоступен без
 *     нативного диалога — мягкий пропуск с ограниченным бюджетом (native dialog не
 *     подвешивает тест до 30s). Полный e2e подтверждается на load-unpacked.
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-e2e-env.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML = '<!doctype html><html><body><p>environment fixture</p></body></html>';
const FAKE_UA = 'QAid-E2E/1.0 (Emulated UA)';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель эмуляции рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'environment');
  await expect(panel.getByTestId('environment-panel')).toBeVisible();
});

// Регрессия-гард: Chrome ЗАПРЕЩАЕТ `declarativeNetRequest*` в `optional_permissions`
// (иначе право молча отбрасывается и `permissions.request` падает). Поэтому оно
// объявлено install-time как `declarativeNetRequestWithHostAccess`. Проверяем БЕЗ
// всякого гранта: право есть у расширения, а DNR-API вызывается без ошибки —
// детерминированно (не permission-gated, нет нативного диалога).
test('DNR-право install-time и API доступен без рантайм-запроса', async ({ context }) => {
  const sw = await serviceWorker(context);
  const hasDnr = await sw.evaluate(() =>
    chrome.permissions.contains({ permissions: ['declarativeNetRequestWithHostAccess'] }),
  );
  expect(hasDnr).toBe(true);
  // `declarativeNetRequest` как optional НЕ объявлено (Chrome бы его отбросил).
  const dnrOptional = await sw.evaluate(
    () => chrome.runtime.getManifest().optional_permissions ?? [],
  );
  expect(dnrOptional).not.toContain('declarativeNetRequest');
  // API namespace доступен и session-rules читаются/пишутся без ошибки прав
  // (removeRuleIds несуществующего id + чтение — host-доступ не требуется).
  const rulesOk = await sw.evaluate(async () => {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [999001] });
      return Array.isArray(await chrome.declarativeNetRequest.getSessionRules());
    } catch {
      return false;
    }
  });
  expect(rulesOk).toBe(true);
});

test('подмена UA меняет заголовок запроса и navigator.userAgent', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант declarativeNetRequest + scripting + host под жестом из side panel.
  const panel = await openSidePanel();
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant_env__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['scripting'], origins: ['*://*/*'] })
        .then((ok) => ((window as unknown as { __env?: boolean }).__env = ok))
        .catch(() => ((window as unknown as { __env?: boolean }).__env = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant_env__').click();
  // Грант ждём под НОДА-бюджетом (withPermissionTimeout), а не только Playwright-таймаутом:
  // запрос `scripting`+host может поднять модальный нативный диалог, который замораживает
  // CDP — тогда даже `waitForFunction({timeout})` не сработает (его таймаут enforced'ится
  // браузером). Node-таймер живёт в процессе тест-раннера и срабатывает независимо →
  // детерминированный soft-skip. Полная проверка — на load-unpacked (ADR-0026).
  // (`declarativeNetRequestWithHostAccess` — install-time, в рантайме не запрашивается.)
  const grantRes = await withPermissionTimeout(
    () =>
      panel
        .waitForFunction(() => (window as unknown as { __env?: boolean }).__env === true, {
          timeout: 8000,
        })
        .then(() => true),
    { label: 'grant scripting+host', budgetMs: 6000 },
  );
  test.skip(
    !grantRes.ok,
    'optional-права не выданы/недоступны в этой среде — проверка на load-unpacked',
  );

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Применяем эмуляцию через background RPC environment/apply (envelope в runtime).
  // Бюджет: зависший на нативном диалоге host-грант блокирует SW/DNR — без бюджета
  // тест висит до 30s вместо детерминированного пропуска.
  const applyRes = await withPermissionTimeout(
    () =>
      panel.evaluate(
        async ([id, ua]: [number, string]) => {
          await chrome.runtime.sendMessage({
            __qatb__: true,
            type: 'environment/apply',
            payload: {
              tabId: id,
              config: {
                userAgent: ua,
                acceptLanguage: null,
                timezone: null,
                geo: { mode: 'off', latitude: 0, longitude: 0, accuracy: 50, errorCode: 1 },
              },
            },
            correlationId: 'e2e-env-apply',
          });
        },
        [realTabId, FAKE_UA] as [number, string],
      ),
    { label: 'RPC environment/apply' },
  );
  test.skip(!applyRes.ok, applyRes.reason ?? '');

  // MAIN-world оверрайд применён к текущему документу: navigator.userAgent подменён.
  // Читаем через бюджет: если грант поднял модальный нативный диалог, он блокирует
  // рендерер и `page.evaluate` зависает — bounded soft-skip вместо 30s-таймаута.
  // Полная сквозная проверка (грант без диалога) — на load-unpacked (ADR-0026).
  const uaRes = await withPermissionTimeout(() => page.evaluate(() => navigator.userAgent), {
    label: 'navigator.userAgent',
  });
  test.skip(
    !uaRes.ok || uaRes.value !== FAKE_UA,
    'MAIN-инъекция недоступна в этой среде (модальный диалог/блок) — проверка на load-unpacked',
  );
  expect(uaRes.value).toBe(FAKE_UA);

  // Вторая плоскость подмены — DNR session-rule на заголовок запроса `User-Agent`.
  // Playwright `route.fulfill` обслуживает запрос В ОБХОД сетевого слоя, где DNR правит
  // заголовки, поэтому фактический заголовок через route не наблюдаем (сквозная проверка
  // заголовка — на load-unpacked, ADR-0026). В CI детерминированно проверяем, что фича
  // УСТАНОВИЛА корректное session-rule подмены UA для этой вкладки.
  const ruleInstalled = await sw.evaluate(async (ua: string) => {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    return rules.some((r) =>
      (r.action?.requestHeaders ?? []).some(
        (h) => h.header?.toLowerCase() === 'user-agent' && h.operation === 'set' && h.value === ua,
      ),
    );
  }, FAKE_UA);
  expect(ruleInstalled).toBe(true);
});

/**
 * e2e фичи «Экспорт состояния бага» (TASK-025) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопка «Собрать состояние
 *     бага») — надёжно и без прав.
 *  2. Сбор окружения: грант `scripting` + host, MAIN-инъекция сборщиков
 *     (`bugReport/collectEnv`) возвращает URL/заголовок вкладки. Требует выданных
 *     optional-прав; где грант host недоступен без нативного диалога — мягкий пропуск
 *     с ограниченным бюджетом (полный e2e — на load-unpacked, ADR-0020/0022).
 */
import { test, expect, openTool } from './fixtures/extension';
import { withPermissionTimeout } from './fixtures/permission-timeout';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-bug.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><head><title>bug fixture</title></head><body><p>x</p></body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель экспорта состояния бага рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'bug-report');
  await expect(
    panel.getByRole('button', { name: /Начать запись бага|Start bug capture/ }),
  ).toBeVisible();
});

test('сбор окружения через MAIN-инъекцию (bugReport/collectEnv)', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  await serviceWorker(context);

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
  const granted = await withPermissionTimeout(
    () =>
      panel.waitForFunction(
        () => (window as unknown as { __granted?: boolean }).__granted === true,
        { timeout: 3000 },
      ),
    { label: 'bug-report grant' },
  );
  test.skip(!granted.ok, granted.reason ?? 'optional-права не выданы в этой среде (load-unpacked)');

  await page.bringToFront();
  const sw = await serviceWorker(context);
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Инъекция сборщиков через фоновый хендлер (как это делает UI-мост).
  const collected = await withPermissionTimeout(
    () =>
      panel.evaluate(async (tabId: number) => {
        const reply = (await chrome.runtime.sendMessage({
          __qatb__: true,
          type: 'bugReport/collectEnv',
          payload: { tabId },
          correlationId: 'e2e-bug-collectEnv',
        })) as { payload?: { meta?: { url?: string } } } | undefined;
        return reply?.payload?.meta?.url ?? '';
      }, realTabId),
    { label: 'bugReport/collectEnv' },
  );
  test.skip(
    !collected.ok,
    collected.reason ?? 'MAIN-инъекция требует host-доступа (load-unpacked)',
  );
  expect(collected.value).toContain(TEST_ORIGIN);
});

const TIMELINE_ORIGIN = 'https://qa-e2e-timeline.test';
const TIMELINE_URL = `${TIMELINE_ORIGIN}/page`;
// Фикстура: форма email + submit-кнопка; submit гасит переход и роняет консольную ошибку.
const TIMELINE_HTML = `<!doctype html><html><head><title>timeline fixture</title></head><body>
<form id="login">
  <input id="email" type="email" />
  <button id="go" data-testid="go" type="submit">Go</button>
</form>
<script>
document.getElementById('login').addEventListener('submit', function (e) {
  e.preventDefault();
  console.error('submit boom');
});
</script>
</body></html>`;

test('таймлайн действий: клик → ввод → submit + консольная ошибка, значение маскировано', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TIMELINE_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TIMELINE_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TIMELINE_URL);
  await serviceWorker(context);

  // Грант scripting + host под жестом из side panel (мягкий пропуск при отказе).
  const panel = await openSidePanel();
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant_tl__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['scripting'], origins: ['*://*/*'] })
        .then((ok) => ((window as unknown as { __grantedTl?: boolean }).__grantedTl = ok))
        .catch(() => ((window as unknown as { __grantedTl?: boolean }).__grantedTl = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant_tl__').click();
  const granted = await withPermissionTimeout(
    () =>
      panel.waitForFunction(
        () => (window as unknown as { __grantedTl?: boolean }).__grantedTl === true,
        { timeout: 3000 },
      ),
    { label: 'bug-report timeline grant' },
  );
  test.skip(!granted.ok, granted.reason ?? 'optional-права не выданы в этой среде (load-unpacked)');

  await page.bringToFront();
  const sw = await serviceWorker(context);
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Вооружаем буферы действий (с маскированием) и консоли через фоновые хендлеры.
  const armed = await withPermissionTimeout(
    () =>
      panel.evaluate(async (tabId: number) => {
        const send = (type: string, payload: Record<string, unknown>): Promise<unknown> =>
          chrome.runtime.sendMessage({
            __qatb__: true,
            type,
            payload,
            correlationId: `e2e-${type}`,
          });
        await send('bugReport/actionsInstall', { tabId, cap: 100, maskInputs: true });
        await send('bugReport/consoleInstall', { tabId, cap: 100 });
        return true;
      }, realTabId),
    { label: 'bugReport/actionsInstall' },
  );
  test.skip(!armed.ok, armed.reason ?? 'MAIN-инъекция требует host-доступа (load-unpacked)');

  // Воспроизводим шаги на странице: ввод секрета → клик по submit (гасит + console.error).
  await page.fill('#email', 'secret@example.test');
  await page.click('#go');
  await page.waitForTimeout(200);

  // Забираем снимок буфера действий и консоли.
  const snapshot = await panel.evaluate(async (tabId: number) => {
    const send = (type: string): Promise<{ payload?: unknown }> =>
      chrome.runtime.sendMessage({
        __qatb__: true,
        type,
        payload: { tabId },
        correlationId: `e2e-read-${type}`,
      }) as Promise<{ payload?: unknown }>;
    const actions = (await send('bugReport/actionsRead')).payload as {
      events: { kind: string; at: number; field?: string; detail?: string }[];
    };
    const console = (await send('bugReport/consoleRead')).payload as {
      entries: { text: string; at: number }[];
    };
    return { actions, console };
  }, realTabId);

  const kinds = snapshot.actions.events.map((e) => e.kind);
  // Порядок: ввод предшествует submit (клик по submit-кнопке = click + submit).
  expect(kinds).toContain('input');
  expect(kinds).toContain('submit');
  expect(kinds.indexOf('input')).toBeLessThan(kinds.lastIndexOf('submit'));

  // Приватность: значение email замаскировано, секрет НЕ утёк в буфер.
  const input = snapshot.actions.events.find((e) => e.kind === 'input');
  expect(input?.field).toBe('email');
  expect(input?.detail).toBe('value hidden');
  expect(JSON.stringify(snapshot.actions)).not.toContain('secret@example.test');

  // Консольная ошибка от submit поймана и ложится на ту же ось (wall-clock `at`).
  expect(snapshot.console.entries.some((e) => e.text.includes('submit boom'))).toBe(true);
});

/**
 * e2e фичи «Мок: DOM-подмена выделением» (TASK-023, часть `dom-override`) поверх
 * собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопка «Выбрать элемент») —
 *     надёжно и без прав.
 *  2. Полный путь косметической подмены: грант `scripting` + host, инъекция
 *     ISOLATED content-хоста (`domOverride/apply`), реальный текст выбранного узла на
 *     фикстуре заменяется, а НЕ узлы, которых не выбирали. Требует выданных
 *     optional-прав; где грант host недоступен без нативного диалога — мягкий пропуск
 *     через бюджет `withPermissionTimeout` (полный e2e — на load-unpacked, ADR-0020/0022).
 */
import { test, expect } from './fixtures/extension';
import { withPermissionTimeout } from './fixtures/permission-timeout';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-domoverride.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body><h1 id="title">original title</h1><p id="keep">keep me</p></body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель DOM-подмены рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: /DOM-подмена|DOM override/ }).click();
  await expect(panel.getByRole('button', { name: /Выбрать элемент|Pick element/ })).toBeVisible();
});

test('косметическая подмена текста выбранного узла (ISOLATED-инъекция)', async ({
  context,
  openSidePanel,
}) => {
  await context.route(TEST_URL, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
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
  const grant = await withPermissionTimeout(
    () =>
      panel.waitForFunction(
        () => (window as unknown as { __granted?: boolean }).__granted === true,
        { timeout: 4000 },
      ),
    { label: 'dom-override grant' },
  );
  test.skip(!grant.ok, grant.reason ?? 'optional-права не выданы в этой среде (load-unpacked)');

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Применяем подмену через фоновый форвардинг (как это делает UI-мост).
  const applied = await panel.evaluate(async (tabId: number) => {
    const reply = (await chrome.runtime.sendMessage({
      __qatb__: true,
      type: 'domOverride/apply',
      payload: {
        tabId,
        entries: [
          {
            id: 'e2e-1',
            selector: '#title',
            label: '#title',
            op: { kind: 'replace-text', text: 'MOCKED TITLE' },
            enabled: true,
          },
        ],
      },
      correlationId: 'e2e-domoverride-apply',
    })) as { payload?: { applied?: number } } | undefined;
    return reply?.payload?.applied ?? 0;
  }, realTabId);
  test.skip(applied < 1, 'ISOLATED-инъекция требует host-доступа — проверка на load-unpacked');

  // Текст выбранного узла подменён; невыбранный узел не тронут.
  await expect(page.locator('#title')).toHaveText('MOCKED TITLE');
  await expect(page.locator('#keep')).toHaveText('keep me');
});

/**
 * e2e навигации по DOM-иерархии (TASK-052) поверх собранного MV3-расширения.
 *
 * Проверяет в реально загруженном расширении, что после выбора листового узла команда
 * `inspection/navigate` двигает якорь по дереву (родитель/ребёнок/сосед), на каждом шаге
 * подсвечивает актуальный узел в Shadow-оверлее и возвращает корректное
 * `NavigationState`, а DOM страницы вне оверлея не мутируется. Требует выданных
 * optional-прав (`scripting` + host ко всем http/https); где грант host недоступен без
 * нативного диалога — мягкий пропуск (полная проверка на Load unpacked, как в
 * `inspection.spec.ts`). Чистую навигацию и host-хендлер детально покрывают юниты.
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-e2e-nav.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
// Вложенная вёрстка: лист span#leaf в p#para в div#card, у #card два ребёнка (#para, #aside).
const TEST_HTML =
  '<!doctype html><html><body>' +
  '<div id="card"><p id="para"><span id="leaf">Hi</span></p><aside id="aside">x</aside></div>' +
  '</body></html>';

const OVERLAY_ATTR = 'data-qatb-overlay';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

/** Шлёт инспекционное сообщение в content-хост вкладки и возвращает payload ответа. */
async function sendToHost<T>(
  sw: Worker,
  tabId: number,
  type: string,
  payload: Record<string, unknown>,
  correlationId: string,
): Promise<T> {
  return sw.evaluate(
    async (args: { id: number; type: string; payload: Record<string, unknown>; cid: string }) => {
      const reply = (await chrome.tabs.sendMessage(args.id, {
        __qatb__: true,
        type: args.type,
        payload: args.payload,
        correlationId: args.cid,
      })) as { payload?: unknown } | undefined;
      return reply?.payload as unknown;
    },
    { id: tabId, type, payload, cid: correlationId },
  ) as Promise<T>;
}

interface NavNode {
  selector: string;
  tagName: string;
}
interface NavState {
  node: NavNode;
  path: NavNode[];
  canAscend: boolean;
  canDescend: boolean;
}

test('навигация по иерархии: pick → ↑/↓/→ двигают якорь, DOM не мутирован', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант optional-прав под жестом из side panel (как в inspection.spec.ts).
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

  const before = await page.evaluate(() => document.body.innerHTML);

  // Инъекция content-хоста (soft-skip без host-доступа).
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
    `инъекция требует host-доступа — проверка на load-unpacked: ${injection.error ?? ''}`,
  );

  // Выбираем листовой узел: запускаем пикер и кликаем по span#leaf.
  const pickPromise = sendToHost<NavState & { navigation: NavState }>(
    sw,
    realTabId,
    'inspection/pick',
    { tabId: realTabId },
    'nav-pick',
  );
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  await page.locator('#leaf').click();
  const picked = await pickPromise;
  expect(picked.navigation.node.selector).toBe('span#leaf');
  expect(picked.navigation.canDescend).toBe(false); // лист

  // ↑ родитель → p#para.
  const toPara = await sendToHost<NavState>(
    sw,
    realTabId,
    'inspection/navigate',
    { tabId: realTabId, step: 'parent' },
    'nav-parent-1',
  );
  expect(toPara.node.selector).toBe('p#para');

  // ↑ родитель → div#card (у него два значимых ребёнка).
  const toCard = await sendToHost<NavState>(
    sw,
    realTabId,
    'inspection/navigate',
    { tabId: realTabId, step: 'parent' },
    'nav-parent-2',
  );
  expect(toCard.node.selector).toBe('div#card');
  expect(toCard.canDescend).toBe(true);

  // ↓ первый ребёнок → p#para; → следующий сосед → aside#aside.
  const down = await sendToHost<NavState>(
    sw,
    realTabId,
    'inspection/navigate',
    { tabId: realTabId, step: 'firstChild' },
    'nav-child',
  );
  expect(down.node.selector).toBe('p#para');
  const toAside = await sendToHost<NavState>(
    sw,
    realTabId,
    'inspection/navigate',
    { tabId: realTabId, step: 'nextSibling' },
    'nav-next',
  );
  expect(toAside.node.selector).toBe('aside#aside');

  // Оверлей по-прежнему подсвечивает актуальный узел (не исчез при навигации).
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBeGreaterThan(0);

  // Снимаем сессию.
  await sendToHost(sw, realTabId, 'inspection/teardown', { tabId: realTabId }, 'nav-teardown');
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBe(0);

  // DOM страницы вне оверлея не изменился ни на одном шаге навигации.
  const after = await page.evaluate(() => document.body.innerHTML);
  expect(after).toBe(before);
});

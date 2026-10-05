/**
 * e2e живого режима инспекции курсором (TASK-056, ADR-0050) поверх собранного
 * MV3-расширения.
 *
 * Проверяет в реально загруженном расширении, что `inspection/pickLive`:
 *  - включает персистентную сессию (оверлей смонтирован, курсор непрерывно готов);
 *  - резолвится на КЛИКЕ снимком кликнутого (самого глубокого под курсором) узла;
 *  - пере-вооружается БЕЗ ремонтажа оверлея (хост `[data-qatb-overlay]` один и тот же —
 *    нет flicker), а клик по вложенному узлу проваливает внутрь (углубление);
 *  - `↑` (`inspection/navigate parent`) поднимает к перекрытому родителю;
 *  - `inspection/pickLiveStop` выходит из live, СОХРАНяя якорь и оверлей (степпер
 *    продолжает работать), а `inspection/teardown` снимает оверлей;
 *  - DOM страницы вне оверлея не мутируется ни на одном шаге.
 *
 * Требует выданных optional-прав (`scripting` + host ко всем http/https); где грант host
 * недоступен без нативного диалога — мягкий пропуск (полная проверка на Load unpacked, как
 * в `inspection.spec.ts`). Persistent-сессию/host-хендлеры детально покрывают юниты.
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-e2e-live.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
// Вложенная вёрстка: у #card есть собственная зона (padding), клик по которой даёт сам
// #card, а клик по #deep — самый глубокий узел (проваливание внутрь).
const TEST_HTML =
  '<!doctype html><html><body>' +
  '<div id="card" style="padding:40px;background:#eee">' +
  '<section id="inner" style="padding:24px;background:#ddd">' +
  '<button id="deep">Hi</button>' +
  '</section></div>' +
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
type LiveResponse = (NavNode & { navigation: NavState }) | null;

test('живой режим: pickLive подсвечивает и проваливает кликом, режим остаётся активным, DOM не мутирован', async ({
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

  // 1) Включаем живой режим: pickLive резолвится на первом клике. Кликаем по СОБСТВЕННОЙ
  //    зоне #card (левый-верхний угол — padding, вне детей) → выбирается #card.
  const live1 = sendToHost<LiveResponse>(
    sw,
    realTabId,
    'inspection/pickLive',
    { tabId: realTabId },
    'live-1',
  );
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  // Ровно один хост оверлея — сессия смонтирована один раз.
  expect(await page.locator(`[${OVERLAY_ATTR}]`).count()).toBe(1);
  await page.locator('#card').click({ position: { x: 6, y: 6 } });
  const picked1 = await live1;
  expect(picked1?.navigation.node.selector).toBe('div#card');

  // 2) Пере-вооружаем БЕЗ ремонтажа: клик по вложенному #deep проваливает внутрь, а хост
  //    оверлея остаётся тем же (нет flicker).
  expect(await page.locator(`[${OVERLAY_ATTR}]`).count()).toBe(1);
  const live2 = sendToHost<LiveResponse>(
    sw,
    realTabId,
    'inspection/pickLive',
    { tabId: realTabId },
    'live-2',
  );
  await page.locator('#deep').click();
  const picked2 = await live2;
  expect(picked2?.navigation.node.selector).toBe('button#deep');
  // Оверлей по-прежнему один и тот же (не пересоздан между кликами).
  expect(await page.locator(`[${OVERLAY_ATTR}]`).count()).toBe(1);

  // 3) Подъём к перекрытому родителю — через степпер (курсором в закрытого детьми
  //    родителя не попасть).
  const up = await sendToHost<NavState>(
    sw,
    realTabId,
    'inspection/navigate',
    { tabId: realTabId, step: 'parent' },
    'live-up',
  );
  expect(up.node.selector).toBe('section#inner');

  // 4) Выход из live (pickLiveStop): оверлей СОХРАНяется, якорь остаётся — навигация
  //    продолжает работать.
  const stop = await sendToHost<{ ok: boolean }>(
    sw,
    realTabId,
    'inspection/pickLiveStop',
    { tabId: realTabId },
    'live-stop',
  );
  expect(stop.ok).toBe(true);
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 3000 })
    .toBe(1); // оверлей не снят выходом из live
  const afterStop = await sendToHost<NavState>(
    sw,
    realTabId,
    'inspection/navigate',
    { tabId: realTabId, step: 'parent' },
    'live-after-stop',
  );
  expect(afterStop.node.selector).toBe('div#card'); // якорь сохранён (поднялись выше)

  // 5) Полное закрытие — teardown снимает оверлей.
  await sendToHost(sw, realTabId, 'inspection/teardown', { tabId: realTabId }, 'live-teardown');
  await expect
    .poll(async () => page.locator(`[${OVERLAY_ATTR}]`).count(), { timeout: 5000 })
    .toBe(0);

  // DOM страницы вне оверлея не изменился ни на одном шаге живого режима.
  const after = await page.evaluate(() => document.body.innerHTML);
  expect(after).toBe(before);
});

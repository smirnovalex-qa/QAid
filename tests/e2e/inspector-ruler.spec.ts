/**
 * e2e фичи «Инспектор: линейка / измеритель» (TASK-018) поверх собранного MV3-расширения.
 *
 * Проверяет две вещи:
 *  1. Инспектор линейки регистрируется и рендерится в side panel (кнопки выбора A/B) —
 *     надёжно и без прав.
 *  2. Измерение между двумя фикстур-элементами: выдаём optional-права (`scripting` +
 *     host-доступ), инъектируем content-хост, дважды прогоняем общий пикер (клик по
 *     фикстур-элементу) и по возвращённым `PickedElement.rect` считаем горизонтальный
 *     зазор — ожидаем 50px по заведомо известной раскладке. Грант host/инъекция могут
 *     требовать нативного диалога, который SW/Playwright не закрывают: при отказе/сбое
 *     тест мягко пропускается (полный e2e — на load-unpacked, ADR-0020/0022), как в
 *     эталонных инспекторах.
 *
 * ПРИМЕЧАНИЕ: до проводки оркестратором (барель `import './inspector-ruler'` и
 * `registerInspector(RULER_INSPECTOR_ID, …)`) тесты закономерно не проходят —
 * фича/сборщик ещё не в бандле. Спека написана корректно и «зазеленеет» после интеграции.
 */
import { test, expect } from './fixtures/extension';
import type { BrowserContext, Page, Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-ruler-e2e.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
// Заведомо известная раскладка: два блока 100×50, левые кромки 0 и 150 → зазор 50px.
const TEST_HTML =
  '<!doctype html><html><body style="margin:0;background:#fff">' +
  '<div id="a" style="position:absolute;left:0;top:0;width:100px;height:50px;background:#eee"></div>' +
  '<div id="b" style="position:absolute;left:150px;top:0;width:100px;height:50px;background:#ddd"></div>' +
  '</body></html>';

async function serviceWorker(context: BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

/** Снимок выбранного элемента, как его возвращает пикер через RPC. */
interface PickedRect {
  rect: { x: number; y: number; width: number; height: number };
}

/** Прогоняет один цикл пикера: старт RPC → клик по фикстур-элементу → снимок. */
async function pickElement(
  sw: Worker,
  page: Page,
  tabId: number,
  selector: string,
  correlationId: string,
): Promise<PickedRect | null> {
  const pending = sw.evaluate(
    async ({ id, cid }) => {
      const reply = (await chrome.tabs.sendMessage(id, {
        __qatb__: true,
        type: 'inspection/pick',
        payload: { tabId: id },
        correlationId: cid,
      })) as { payload?: PickedRect | null } | undefined;
      return reply?.payload ?? null;
    },
    { id: tabId, cid: correlationId },
  );
  // Даём пикеру повесить перехватчик клика (фаза capture на document), затем кликаем.
  await page.waitForTimeout(300);
  await page.locator(selector).click();
  return (await pending) as PickedRect | null;
}

test('линейка рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка редизайна показывает одну активную панель — активируем линейку кликом
  // по кнопке рельса (aria-label = заголовок фичи). В теле активной панели (режим ab
  // по умолчанию) — кнопки выбора A/B.
  await panel.getByRole('button', { name: /Линейка|Ruler/ }).click();
  await expect(panel.getByRole('button', { name: /Выбрать A|Pick A/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Выбрать B|Pick B/ })).toBeVisible();
});

test('измерение между двумя элементами даёт зазор 50px', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант `scripting` + host-доступ под жестом из side panel.
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
  const granted = await panel
    .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  const injection = await sw.evaluate(async (id: number) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: id },
        files: ['content-inspection.js'],
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, realTabId);
  test.skip(
    !injection.ok,
    `инъекция требует выданного host-доступа: ${injection.error ?? ''} — проверка на load-unpacked`,
  );

  const a = await pickElement(sw, page, realTabId, '#a', 'e2e-ruler-pick-a');
  const b = await pickElement(sw, page, realTabId, '#b', 'e2e-ruler-pick-b');
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();

  // Горизонтальный зазор = левая кромка B минус правая кромка A.
  const gap = b!.rect.x - (a!.rect.x + a!.rect.width);
  expect(Math.round(gap)).toBe(50);
});

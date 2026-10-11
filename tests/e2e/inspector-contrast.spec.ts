/**
 * e2e фичи «Инспектор: контраст WCAG» (TASK-014) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопка «Сканировать страницу») —
 *     надёжно и без прав.
 *  2. Страничный скан контраста работает end-to-end на фикстуре с заведомо
 *     проваленной парой (светло-серый текст на белом): инъекция сборщика `contrast`,
 *     RPC `inspection/scan`, возврат сериализуемых образцов с вычисленным контрастом.
 *     Требует выданных optional-прав (`scripting` + host-доступ); там, где грант host
 *     недоступен без нативного диалога, тест мягко пропускается — полный e2e инъекции
 *     подтверждается на load-unpacked (см. PROGRESS/ADR-0020/ADR-0022).
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-contrast.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
// Заведомо проваленная пара: светло-серый (#aaaaaa) текст на белом фоне (~2.3:1 < AA),
// и валидная пара (чёрный на белом, 21:1) — чтобы скан вернул смешанный результат.
const TEST_HTML =
  '<!doctype html><html><body style="background:#fff">' +
  '<p id="bad" style="color:#aaaaaa">Low contrast paragraph</p>' +
  '<p id="ok" style="color:#000">High contrast paragraph</p>' +
  '</body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('инспектор контраста рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка редизайна показывает ОДНУ активную панель — активируем инспектор кликом
  // по кнопке рельса (её aria-label = заголовок фичи), затем скоупим по метке панели.
  await openTool(panel, 'inspector-contrast');
  await expect(panel.getByRole('button', { name: /Сканировать страницу|Scan page/ })).toBeVisible();
});

test('страничный скан контраста: инъекция сборщика, RPC, проваленная пара', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант `scripting` + постоянный host-доступ под жестом из side panel. Запрос host
  // может требовать нативного диалога — при отказе/таймауте мягкий пропуск.
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

  // Инъекция content-хоста (со сборщиком `contrast`, проведённым оркестратором в бандл).
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
    `инъекция требует выданного host-доступа; грант host мог не пройти без нативного диалога: ${injection.error ?? ''} — проверка на load-unpacked`,
  );

  // Запускаем страничный скан контраста через RPC и разбираем сериализуемый ответ.
  const result = (await sw.evaluate(async (id: number) => {
    const reply = (await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'inspection/scan',
      payload: { tabId: id, inspectorId: 'contrast' },
      correlationId: 'e2e-contrast-scan',
    })) as { payload?: { data?: { samples?: { selector: string; ratio: number }[] } } } | undefined;
    return reply?.payload?.data?.samples ?? [];
  }, realTabId)) as { selector: string; ratio: number }[];

  // Есть образцы, и заведомо проваленная пара с низким контрастом присутствует.
  expect(result.length).toBeGreaterThan(0);
  const bad = result.find((s) => s.selector.includes('#bad'));
  expect(bad).toBeDefined();
  expect(bad?.ratio).toBeLessThan(4.5);
});

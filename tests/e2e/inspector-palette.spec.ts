/**
 * e2e фичи «Инспектор: палитра цветов» (TASK-015) поверх собранного MV3-расширения.
 *
 * Проверяет две вещи:
 *  1. Инспектор палитры регистрируется и рендерится в side panel (UI end-to-end
 *     через реестр фич) — надёжно и без прав.
 *  2. Сбор палитры на фикстур-странице: выдаём optional-права (`scripting` +
 *     host-доступ), запускаем сканирование, ждём появления сетки свотчей. Грант
 *     host может требовать нативного диалога, который SW/Playwright не закрывают:
 *     при отказе/таймауте тест мягко пропускается (полный e2e — на load-unpacked),
 *     как в эталонном инспекторе (см. `inspection.spec.ts`, ADR-0020/0022).
 */
import { test, expect, openTool } from './fixtures/extension';

const TEST_ORIGIN = 'https://qa-palette-e2e.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body style="background:#ffffff">' +
  '<h1 style="color:rgb(255,0,0)">Heading</h1>' +
  '<button style="background-color:rgb(0,0,255);color:#ffffff">Click me</button>' +
  '</body></html>';

/** Активирует панель палитры кликом по её кнопке рельса (оболочка редизайна показывает
 *  одну активную панель; aria-label кнопки рельса = заголовок фичи). */
async function openPalette(panel: import('@playwright/test').Page): Promise<void> {
  await openTool(panel, 'inspector-palette');
}

test('палитра цветов рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openPalette(panel);
  await expect(panel.getByRole('button', { name: /Сканировать страницу|Scan page/ })).toBeVisible();
});

test('сбор палитры: сканирование заполняет сетку свотчей', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);
  await page.bringToFront();

  const panel = await openSidePanel();
  await openPalette(panel);

  // Выдаём optional-права под жестом из side panel (как в inspection.spec).
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

  // Активная панель одна — скоуп по метке больше не нужен (единственная кнопка скана).
  await panel.getByRole('button', { name: /Сканировать страницу|Scan page/ }).click();

  // Грант optional-прав под жестом мог не примениться к вкладке без нативного диалога
  // (как в inspection.spec) — тогда скан вернёт ошибку доступа. Ждём ЛИБО сетку
  // свотчей, ЛИБО alert о нехватке доступа, и при отказе — мягкий пропуск (полный
  // e2e подтверждается на load-unpacked, ADR-0020/0022). Так тест детерминирован.
  const grid = panel.getByTestId('palette-grid');
  // Скоуп на конкретный alert панели (`palette-error`): глобальный Toast-контейнер
  // тоже имеет role="alert" → getByRole('alert') дал бы strict-mode конфликт.
  const denied = panel.getByTestId('palette-error');
  await expect(grid.or(denied).first()).toBeVisible({ timeout: 8000 });
  test.skip(
    await denied.isVisible(),
    'host-доступ не выдан в этой среде — проверка на load-unpacked',
  );

  // Сетка свотчей появилась — палитра собрана.
  await expect(grid).toBeVisible();
  await expect(panel.getByTestId('palette-swatch').first()).toBeVisible();
});

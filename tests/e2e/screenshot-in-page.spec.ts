/**
 * e2e in-page («заморозка экрана», TASK-035) редактора скриншота поверх собранного
 * MV3-расширения.
 *
 * Проверяет:
 *  1. Кнопка «Редактировать на странице» рендерится в side panel — надёжно, без прав.
 *  2. Best-effort сквозной запуск: грант host+scripting под жестом → клик «Edit on
 *     page» → на целевой странице появляется закрытый Shadow-DOM оверлей-хост
 *     (`[data-qatb-overlay]`) с «замороженным» кадром → drag-выделение региона на
 *     уровне document не роняет оверлей и не уводит страницу. Где грант/захват требуют
 *     нативного диалога — тест мягко пропускается (как `screenshot.spec.ts`).
 *
 * Корректность PNG/замазки (пиксели вырезки) покрыта юнит-тестами общего конвейера
 * (`shared/inspection/screenshot/draw` + `region`); тулбар живёт в ЗАКРЫТОМ Shadow-DOM
 * и недоступен драйверу, поэтому финальный экспорт из UI здесь не автоматизируется.
 */
import { test, expect, openTool } from './fixtures/extension';

const TEST_ORIGIN = 'https://qa-e2e-screenshot-inpage.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body style="background:#30a46c;margin:0">' +
  '<div style="height:1600px">frozen page fixture</div>' +
  '</body></html>';

/** Грант host+scripting под жестом из side panel; false — если среда требует диалога. */
async function grant(panel: import('@playwright/test').Page): Promise<boolean> {
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['scripting'], origins: ['<all_urls>'] })
        .then((ok) => ((window as unknown as { __granted?: boolean }).__granted = ok))
        .catch(() => ((window as unknown as { __granted?: boolean }).__granted = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant__').click();
  return panel
    .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
}

test('«Редактировать на странице» рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'screenshot');
  // v3 Capture: выбор «Видимая область» запускает in-page поток («заморозка экрана»).
  await expect(panel.getByRole('button', { name: /Видимая область|Visible area/ })).toBeVisible();
});

test('best-effort: запуск in-page замораживает вьюпорт и принимает выделение', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const panel = await openSidePanel();
  await openTool(panel, 'screenshot');

  const granted = await grant(panel);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  // «Видимая область» = вход в in-page поток (заморозка кадра + аннотирование на странице).
  await panel.getByRole('button', { name: /Видимая область|Visible area/ }).click();

  // Оверлей-хост появляется на странице (закрытый shadow внутри — драйверу не виден).
  const hostAppeared = await page
    .waitForFunction(() => document.querySelector('[data-qatb-overlay]') !== null, {
      timeout: 6000,
    })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !hostAppeared,
    'кадр/инъекция требуют активной вкладки и нативного грана — проверка на load-unpacked',
  );

  // Drag-выделение региона на уровне document (слушатели оверлея — capture-phase).
  await page.mouse.move(120, 120);
  await page.mouse.down();
  await page.mouse.move(360, 300, { steps: 8 });
  await page.mouse.up();

  // Оверлей жив, страница не ушла по навигации (событие не «протекло» в контент).
  await expect(page).toHaveURL(TEST_URL);
  const stillThere = await page.evaluate(
    () => document.querySelector('[data-qatb-overlay]') !== null,
  );
  expect(stillThere).toBe(true);

  // Esc снимает оверлей полностью (нет утечки узлов).
  await page.keyboard.press('Escape');
  const removed = await page
    .waitForFunction(() => document.querySelector('[data-qatb-overlay]') === null, {
      timeout: 3000,
    })
    .then(() => true)
    .catch(() => false);
  expect(removed).toBe(true);
});

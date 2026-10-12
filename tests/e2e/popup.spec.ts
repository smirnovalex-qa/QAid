/**
 * Smoke + эталон e2e: реальная фича декодеров (TASK-009) в собранном popup.
 *
 * Проверяет сквозной путь: открытие popup → навигация к категории «Утилиты» →
 * под-вкладка Base64 → ввод известного вектора → корректный вывод → кнопка Copy
 * кладёт результат в буфер обмена.
 */
import { test, expect, openTool } from './fixtures/extension';

test.describe('Popup — декодеры (Base64)', () => {
  test('декодирует известный Base64-вектор и копирует результат', async ({
    context,
    openPopup,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await openPopup();

    // Оболочка редизайна: strip быстрых инструментов — активируем декодеры кликом по
    // их кнопке (aria-label = заголовок фичи).
    await page.getByRole('button', { name: 'Декодеры' }).click();
    // Под-вкладка Base64 (направление по умолчанию — «Декодировать»).
    await page.getByRole('tab', { name: 'Base64' }).click();

    // 'Zm9vYmFy' == base64('foobar') (RFC 4648 §10).
    await page.getByTestId('dec-input').fill('Zm9vYmFy');
    await expect(page.getByTestId('dec-output')).toContainText('foobar');

    // Copy кладёт вывод в буфер обмена.
    await page.getByRole('button', { name: 'Копировать' }).click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe('foobar');
  });

  test('битый Base64 показывает локализованную ошибку', async ({ openPopup }) => {
    const page = await openPopup();
    await page.getByRole('button', { name: 'Декодеры' }).click();
    await page.getByRole('tab', { name: 'Base64' }).click();

    // Символ вне алфавита → ошибка декодирования с ролью status.
    await page.getByTestId('dec-input').fill('@@@@');
    await expect(page.getByTestId('dec-error')).toBeVisible();
  });
});

test.describe('Popup — синхронизация поверхностей (ADR-0025)', () => {
  // Все фичи (`surface: 'both'`) присутствуют в strip popup синхронно с рельсом side
  // panel. Сканирующий инспектор рендерит реальный UI прямо в popup (скан программный,
  // без живого пика по странице).
  test('сканирующий инспектор рендерится в popup', async ({ openPopup }) => {
    const page = await openPopup();
    await openTool(page, 'inspector-contrast');
    await expect(page.getByRole('button', { name: 'Сканировать страницу' })).toBeVisible();
  });

  // Пикер (`requiresPanel`) тоже виден в strip popup, но вместо неработающего пикера
  // (popup закрывается при клике по странице) показывает fallback с кнопкой открытия
  // side panel — так фича доступна на обеих поверхностях без сломанного UX.
  test('пикер-инспектор виден в popup, но предлагает открыть side panel', async ({ openPopup }) => {
    const page = await openPopup();
    await openTool(page, 'inspector-probe');
    await expect(page.getByText(/Работает в боковой панели|Opens in the side panel/)).toBeVisible();
  });

  // Hand-off: side panel гидратируется из СВОИХ ключей навигации, поэтому popup обязан
  // записать в них текущий инструмент до открытия панели (иначе откроется «последнее»).
  test('«Открыть side panel» стейджит навигацию side panel на текущий инструмент', async ({
    openPopup,
  }) => {
    const page = await openPopup();
    await openTool(page, 'inspector-probe');
    await expect(page.getByText(/Работает в боковой панели|Opens in the side panel/)).toBeVisible();

    // Кнопка fallback в теле (в шапке одноимённая иконка — берём кнопку с текстом в body).
    await page
      .getByRole('button', { name: /Открыть side panel|Open side panel/ })
      .last()
      .click();

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const r = await chrome.storage.local.get([
            'ui.surface.view.sidepanel',
            'ui.surface.tool.sidepanel',
          ]);
          return [r['ui.surface.view.sidepanel'], r['ui.surface.tool.sidepanel']];
        }),
      )
      .toEqual(['tool', 'inspector-probe']);
  });
});

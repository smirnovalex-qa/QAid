/**
 * Smoke + эталон e2e: реальная фича декодеров (TASK-009) в собранном popup.
 *
 * Проверяет сквозной путь: открытие popup → навигация к категории «Утилиты» →
 * под-вкладка Base64 → ввод известного вектора → корректный вывод → кнопка Copy
 * кладёт результат в буфер обмена.
 */
import { test, expect } from './fixtures/extension';

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
    await expect(page.getByTestId('dec-output')).toHaveValue('foobar');

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
    await page.getByRole('button', { name: 'Контраст WCAG' }).click();
    await expect(page.getByRole('button', { name: 'Сканировать страницу' })).toBeVisible();
  });

  // Пикер (`requiresPanel`) тоже виден в strip popup, но вместо неработающего пикера
  // (popup закрывается при клике по странице) показывает fallback с кнопкой открытия
  // side panel — так фича доступна на обеих поверхностях без сломанного UX.
  test('пикер-инспектор виден в popup, но предлагает открыть side panel', async ({ openPopup }) => {
    const page = await openPopup();
    await page.getByRole('button', { name: 'Инспектор элемента' }).click();
    await expect(page.getByText(/только в side panel/)).toBeVisible();
  });
});

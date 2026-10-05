/**
 * a11y smoke: axe-core на открытых popup и side panel (TASK-011 §6).
 *
 * Гейтим по нарушениям уровня `serious`/`critical` правил WCAG 2.0/2.1 A/AA —
 * это отсекает грубые регрессии доступности, не заваливая на косметике.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures/extension';
import type { Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);

/** Возвращает id правил с нарушениями уровня serious/critical (пусто = чисто). */
async function blockingViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.filter((v) => (v.impact ? BLOCKING.has(v.impact) : false)).map((v) => v.id);
}

test.describe('a11y — поверхности расширения', () => {
  test('popup не имеет serious/critical нарушений', async ({ openPopup }) => {
    const page = await openPopup();
    // Оболочка редизайна: ждём монтирования по кнопке поиска топбара (⌘K), а не по
    // tablist (в редизайне навигация — strip кнопок инструментов, не вкладки).
    await expect(page.getByRole('button', { name: /Поиск/ }).first()).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });

  test('side panel не имеет serious/critical нарушений', async ({ openSidePanel }) => {
    const page = await openSidePanel();
    // Даём оболочке смонтироваться (первый tablist/заголовок).
    await page.waitForLoadState('domcontentloaded');
    expect(await blockingViolations(page)).toEqual([]);
  });
});

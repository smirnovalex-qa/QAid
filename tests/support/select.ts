/**
 * Тест-хелпер для кастомного `Select` (listbox-комбобокс, не нативный <select>).
 * Открывает список по метке поля и кликает опцию по её `value` (data-value).
 * Список рендерится порталом в <body>, поэтому ищем опцию через document.
 */
import { fireEvent, screen } from '@testing-library/preact';

/** Выбрать в `Select` (по метке Field) опцию с заданным value. */
export function selectOption(label: string, value: string): void {
  fireEvent.click(screen.getByLabelText(label));
  const option = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
  if (!option) throw new Error(`selectOption: опция value="${value}" не найдена для «${label}»`);
  fireEvent.click(option);
}

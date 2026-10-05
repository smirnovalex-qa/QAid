/**
 * Генератор дат в диапазоне (TASK-034).
 *
 * Чистый, на инъектируемом `RandomSource`. Диапазон задаётся в эпохе (мс), выбор
 * смещения — через `rng.below(span)` (без modulo-bias). Границы включительны.
 */
import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Равномерная дата в `[from, to]` ВКЛЮЧИТЕЛЬНО.
 *
 * @param from Нижняя граница.
 * @param to Верхняя граница (если ≤ from — возвращается `from`).
 * @param rng Источник случайности (по умолчанию `secureRandom`).
 * @returns Новый `Date` в диапазоне.
 */
export function dateInRange(from: Date, to: Date, rng: RandomSource = secureRandom): Date {
  const lo = from.getTime();
  const hi = to.getTime();
  if (!(hi > lo)) return new Date(lo);
  const span = hi - lo + 1; // +1 — верхняя граница включительна
  return new Date(lo + rng.below(span));
}

/** Форматирует дату в `YYYY-MM-DD` по UTC (стабильно, без TZ-дрейфа). */
export function toIsoDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad2(
    date.getUTCMonth() + 1,
  )}-${pad2(date.getUTCDate())}`;
}

/**
 * Внутренние помощники слоя тест-данных (TASK-034) — общие для identity/phone/
 * datetime/smart. Не часть публичного API (в барель не реэкспортируются).
 *
 * ВСЯ случайность идёт через инъектируемый `RandomSource`; индексные/числовые
 * выборки — через `rng.below(n)` (rejection sampling, БЕЗ modulo-bias — инвариант
 * TASK-006). `% n` здесь запрещён.
 */
import type { RandomSource } from '@/shared/random';

/**
 * Равномерный элемент непустого массива через `rng.below(len)` (без modulo-bias).
 *
 * @throws RangeError если массив пуст (нарушение инварианта вызывающего —
 *   таблицы данных курируются непустыми).
 */
export function pick<T>(arr: readonly T[], rng: RandomSource): T {
  if (arr.length === 0) throw new RangeError('pick: пустой массив');
  const value = arr[rng.below(arr.length)];
  // Индекс в [0, len) → элемент определён; guard — ради noUncheckedIndexedAccess.
  if (value === undefined) throw new RangeError('pick: индекс вне диапазона');
  return value;
}

/** Строка из `len` случайных десятичных цифр (каждая — через `rng.below(10)`). */
export function digits(len: number, rng: RandomSource): string {
  let out = '';
  for (let i = 0; i < len; i += 1) out += String(rng.below(10));
  return out;
}

/** Равномерное целое в `[min, max]` ВКЛЮЧИТЕЛЬНО (через `rng.below(span)`). */
export function intInRange(min: number, max: number, rng: RandomSource): number {
  if (max <= min) return min;
  return min + rng.below(max - min + 1);
}

/**
 * `n` случайных байтов `[0, 255]` через `rng.below(256)` — источник энтропии для
 * card/iban/uuid. Без `% 256` смещения (below — rejection sampling).
 */
export function randomBytes(n: number, rng: RandomSource): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) out[i] = rng.below(256);
  return out;
}

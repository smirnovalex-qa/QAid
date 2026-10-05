/**
 * Чистая логика фичи «Случайные числа» — без Preact/DOM.
 *
 * Все выборщики принимают инъектируемый `RandomSource` (по умолчанию crypto),
 * что делает тесты детерминированными. Равномерность целых — через `src.below`
 * (rejection sampling), НИКОГДА через `% span` на сырой энтропии.
 */

import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import { MAX_COUNT, MAX_PRECISION } from './types';
import type { RandomNumbersParams, ValidationError } from './types';

export { MAX_COUNT, MAX_PRECISION } from './types';
export type { RandomNumbersParams, NumberMode, ValidationError } from './types';

/** Нормализует «минус ноль» в обычный ноль. */
function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;
}

/**
 * Проверяет параметры генерации; возвращает список ошибок (пустой — если валидно).
 *
 * @param p Параметры генерации.
 * @returns Массив ошибок валидации.
 */
export function validateParams(p: RandomNumbersParams): ValidationError[] {
  const errors: ValidationError[] = [];

  const minFinite = Number.isFinite(p.min);
  const maxFinite = Number.isFinite(p.max);
  if (!minFinite) errors.push({ code: 'non_finite', field: 'min' });
  if (!maxFinite) errors.push({ code: 'non_finite', field: 'max' });

  // min > max проверяем только когда обе границы конечны
  if (minFinite && maxFinite && p.min > p.max) errors.push({ code: 'min_gt_max' });

  // В режиме integer конечные границы обязаны быть целыми
  if (p.mode === 'integer') {
    if (minFinite && !Number.isInteger(p.min)) {
      errors.push({ code: 'int_bounds_not_integer', field: 'min' });
    }
    if (maxFinite && !Number.isInteger(p.max)) {
      errors.push({ code: 'int_bounds_not_integer', field: 'max' });
    }
  }

  if (!Number.isInteger(p.precision) || p.precision < 0 || p.precision > MAX_PRECISION) {
    errors.push({ code: 'precision_range' });
  }

  if (!Number.isInteger(p.count) || p.count < 1 || p.count > MAX_COUNT) {
    errors.push({ code: 'count_range' });
  }

  return errors;
}

/**
 * Равномерное целое в `[min, max]` — ИНКЛЮЗИВНО обе границы, без modulo-bias.
 *
 * @param min Нижняя граница (включительно).
 * @param max Верхняя граница (включительно).
 * @param src Источник случайности (по умолчанию crypto).
 * @returns Целое в `[min, max]`.
 */
export function randomInt(min: number, max: number, src: RandomSource = secureRandom): number {
  const span = max - min + 1; // span 1 при min === max → below(1) === 0
  return min + src.below(span);
}

/**
 * Равномерное вещественное в `[min, max]`, округлённое до `precision` знаков
 * (half-up) и зажатое в границы (округление вверх у края не превысит `max`).
 *
 * @param min Нижняя граница (включительно).
 * @param max Верхняя граница (включительно).
 * @param precision Знаков после запятой (0..MAX_PRECISION).
 * @param src Источник случайности (по умолчанию crypto).
 * @returns Вещественное в `[min, max]`.
 */
export function randomFloat(
  min: number,
  max: number,
  precision: number,
  src: RandomSource = secureRandom,
): number {
  if (min === max) return normalizeZero(min);
  const raw = min + src.float() * (max - min);
  const factor = 10 ** precision;
  const rounded = Math.round(raw * factor) / factor; // Math.round — half-up
  const clamped = rounded < min ? min : rounded > max ? max : rounded;
  return normalizeZero(clamped);
}

/**
 * Генерирует `params.count` значений согласно режиму. Параметры считаются валидными.
 *
 * @param params Параметры генерации.
 * @param src Источник случайности (по умолчанию crypto).
 * @returns Массив сгенерированных значений.
 */
export function batch(params: RandomNumbersParams, src: RandomSource = secureRandom): number[] {
  const values: number[] = new Array<number>(params.count);
  for (let i = 0; i < params.count; i++) {
    values[i] =
      params.mode === 'integer'
        ? randomInt(params.min, params.max, src)
        : randomFloat(params.min, params.max, params.precision, src);
  }
  return values;
}

/**
 * Склеивает значения через разделитель (без хвостового разделителя),
 * нормализуя `-0` → `0`.
 *
 * @param values Значения.
 * @param separator Разделитель.
 * @returns Строка plain-вывода.
 */
export function formatOutput(values: readonly number[], separator: string): string {
  return values.map((v) => String(normalizeZero(v))).join(separator);
}

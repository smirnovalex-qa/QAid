/**
 * Общие типы фичи «Случайные числа» — вынесены отдельно, чтобы чистая логика,
 * настройки и UI зависели от единого контракта, а не друг от друга.
 */

export type NumberMode = 'integer' | 'float';

export interface RandomNumbersParams {
  readonly mode: NumberMode;
  readonly min: number;
  readonly max: number;
  /** Знаков после запятой (только float); 0..MAX_PRECISION. */
  readonly precision: number;
  /** Сколько значений сгенерировать; 1..MAX_COUNT. */
  readonly count: number;
  /** Разделитель для plain-вывода (напр. ', ' | '\n' | ' '). */
  readonly separator: string;
}

export const MAX_COUNT = 100_000;
export const MAX_PRECISION = 100;

export type ValidationError =
  | { readonly code: 'min_gt_max' }
  | { readonly code: 'non_finite'; readonly field: 'min' | 'max' }
  | { readonly code: 'int_bounds_not_integer'; readonly field: 'min' | 'max' }
  | { readonly code: 'precision_range' }
  | { readonly code: 'count_range' };

export const RANDOM_NUMBERS_DEFAULTS: RandomNumbersParams = {
  mode: 'integer',
  min: 0,
  max: 100,
  precision: 2,
  count: 10,
  separator: ', ',
};

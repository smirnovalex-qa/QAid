/**
 * Общие типы фичи «Случайные строки» — единый контракт для чистой логики,
 * настроек и UI (по образцу random-numbers).
 */

/** Набор включённых классов символов алфавита + опциональные пользовательские символы. */
export interface AlphabetOptions {
  readonly latinLower: boolean;
  readonly latinUpper: boolean;
  readonly cyrillicLower: boolean;
  readonly cyrillicUpper: boolean;
  readonly digits: boolean;
  readonly special: boolean;
  readonly emoji: boolean;
  /** Дополнительные символы (разбиваются на графемы); `''` — нет пользовательских. */
  readonly custom: string;
  // TODO(password-policy): будущий хук «требовать хотя бы один из каждого класса» — сейчас не реализуем.
}

/** Преобразование регистра тела строки. */
export type CaseTransform = 'none' | 'upper' | 'lower' | 'title';

/** Параметры генерации случайных строк. */
export interface RandomStringsParams {
  readonly alphabet: AlphabetOptions;
  readonly lengthFrom: number;
  readonly lengthTo: number;
  readonly prefix: string;
  readonly suffix: string;
  readonly caseTransform: CaseTransform;
  readonly count: number;
}

export const MAX_COUNT = 100_000;
export const MAX_LENGTH = 4096;

export type ValidationError =
  | { readonly code: 'empty_alphabet' }
  | { readonly code: 'length_range' }
  | { readonly code: 'length_too_big' }
  | { readonly code: 'count_range' };

export const RANDOM_STRINGS_DEFAULTS: RandomStringsParams = {
  alphabet: {
    latinLower: true,
    latinUpper: true,
    cyrillicLower: false,
    cyrillicUpper: false,
    digits: true,
    special: false,
    emoji: false,
    custom: '',
  },
  lengthFrom: 8,
  lengthTo: 16,
  prefix: '',
  suffix: '',
  caseTransform: 'none',
  count: 10,
};

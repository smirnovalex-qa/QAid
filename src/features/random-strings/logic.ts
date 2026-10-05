/**
 * Чистая логика фичи «Случайные строки» — без Preact/DOM/chrome.
 *
 * Все выборщики принимают инъектируемый `RandomSource` (по умолчанию crypto),
 * что делает тесты детерминированными. Равномерность выбора символа — через
 * `src.below(alphabet.length)`, НИКОГДА через `% alphabet.length` (нет modulo-bias).
 *
 * Алфавит трактуется как массив графем: конкатенация склеивает целые графемы,
 * поэтому суррогатные пары (эмодзи) никогда не разбиваются.
 */

import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import {
  CYRILLIC_LOWER,
  CYRILLIC_UPPER,
  DIGITS,
  EMOJI,
  LATIN_LOWER,
  LATIN_UPPER,
  SPECIAL,
} from './charsets';
import { MAX_COUNT, MAX_LENGTH } from './types';
import type { AlphabetOptions, CaseTransform, RandomStringsParams, ValidationError } from './types';

export { MAX_COUNT, MAX_LENGTH } from './types';
export type { AlphabetOptions, CaseTransform, RandomStringsParams, ValidationError } from './types';

// Единый сегментатор графем: создаётся один раз, если среда его поддерживает.
const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined;

/**
 * Разбивает строку на графемы.
 *
 * Использует `Intl.Segmenter` (granularity: 'grapheme') при доступности —
 * тогда составные графемы не разрываются. ФОЛБЭК без Segmenter: разбиение по
 * кодовым точкам (`[...str]`) — суррогатные пары сохраняются, но ZWJ-склейки
 * могут распасться на составляющие.
 *
 * @param str Исходная строка.
 * @returns Массив графем.
 */
export function toGraphemes(str: string): string[] {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(str), (seg) => seg.segment);
  }
  return Array.from(str);
}

/**
 * Строит алфавит: объединение включённых встроенных наборов в стабильном
 * порядке (latinLower, latinUpper, cyrillicLower, cyrillicUpper, digits,
 * special, emoji), затем графемы `custom`. Дедуп по значению графемы через Set
 * с сохранением порядка первого вхождения. Пустой результат допустим.
 *
 * @param options Флаги включённых классов + пользовательские символы.
 * @returns Массив уникальных графем.
 */
export function buildAlphabet(options: AlphabetOptions): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (chars: readonly string[]): void => {
    for (const ch of chars) {
      if (!seen.has(ch)) {
        seen.add(ch);
        result.push(ch);
      }
    }
  };

  if (options.latinLower) add(LATIN_LOWER);
  if (options.latinUpper) add(LATIN_UPPER);
  if (options.cyrillicLower) add(CYRILLIC_LOWER);
  if (options.cyrillicUpper) add(CYRILLIC_UPPER);
  if (options.digits) add(DIGITS);
  if (options.special) add(SPECIAL);
  if (options.emoji) add(EMOJI);
  if (options.custom !== '') {
    add(toGraphemes(options.custom));
  }

  return result;
}

/**
 * Проверяет параметры генерации; возвращает список ошибок (пустой — если валидно).
 *
 * @param p Параметры генерации.
 * @returns Массив ошибок валидации.
 */
export function validateParams(p: RandomStringsParams): ValidationError[] {
  const errors: ValidationError[] = [];

  if (buildAlphabet(p.alphabet).length === 0) {
    errors.push({ code: 'empty_alphabet' });
  }

  // length_range: некорректные/нецелые границы или from > to.
  if (
    !Number.isInteger(p.lengthFrom) ||
    !Number.isInteger(p.lengthTo) ||
    p.lengthFrom < 0 ||
    p.lengthTo < 0 ||
    p.lengthFrom > p.lengthTo
  ) {
    errors.push({ code: 'length_range' });
  }

  if (p.lengthTo > MAX_LENGTH) {
    errors.push({ code: 'length_too_big' });
  }

  if (!Number.isInteger(p.count) || p.count < 1 || p.count > MAX_COUNT) {
    errors.push({ code: 'count_range' });
  }

  return errors;
}

/**
 * Равномерная длина в `[from, to]` — ИНКЛЮЗИВНО обе границы, без modulo-bias.
 *
 * @param from Нижняя граница (включительно).
 * @param to Верхняя граница (включительно).
 * @param src Источник случайности (по умолчанию crypto).
 * @returns Целое в `[from, to]`.
 */
export function randomLengthInRange(
  from: number,
  to: number,
  src: RandomSource = secureRandom,
): number {
  return from + src.below(to - from + 1); // span 1 при from === to → below(1) === 0
}

/**
 * Собирает случайную строку из `length` графем. Индекс символа выбирается через
 * `src.below(alphabet.length)` (равномерно, без modulo-bias).
 *
 * @param length Длина в графемах; `0` → `''` без обращения к алфавиту.
 * @param alphabet Массив графем (непустой при `length > 0`).
 * @param src Источник случайности (по умолчанию crypto).
 * @returns Строка из `length` графем.
 * @throws RangeError Если `alphabet` пуст при `length > 0` (инвариант нарушён —
 *   вызывающий обязан провалидировать параметры заранее).
 */
export function randomString(
  length: number,
  alphabet: readonly string[],
  src: RandomSource = secureRandom,
): string {
  if (length <= 0) return '';
  if (alphabet.length === 0) {
    throw new RangeError('randomString: пустой алфавит при length > 0');
  }

  let out = '';
  for (let i = 0; i < length; i++) {
    const ch = alphabet[src.below(alphabet.length)];
    // ch всегда определён: индекс в [0, alphabet.length). Guard — только ради
    // noUncheckedIndexedAccess, без non-null-assertion.
    if (ch !== undefined) out += ch;
  }
  return out;
}

/**
 * Заглавляет первую графему каждого слова (слова разделены пробельными
 * символами); остальные графемы не меняются.
 */
function titleCase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((token) => {
      if (token === '' || /^\s+$/.test(token)) return token;
      const graphemes = toGraphemes(token);
      const first = graphemes[0];
      if (first === undefined) return token;
      return first.toLocaleUpperCase() + graphemes.slice(1).join('');
    })
    .join('');
}

/**
 * Применяет преобразование регистра к телу строки. Локале-зависимо
 * (`toLocaleUpperCase`/`toLocaleLowerCase`); цифры и эмодзи не затрагиваются.
 *
 * @param s Тело строки.
 * @param mode Режим преобразования.
 * @returns Преобразованная строка.
 */
export function applyCase(s: string, mode: CaseTransform): string {
  switch (mode) {
    case 'none':
      return s;
    case 'upper':
      return s.toLocaleUpperCase();
    case 'lower':
      return s.toLocaleLowerCase();
    case 'title':
      return titleCase(s);
  }
}

/**
 * Генерирует `params.count` строк. Порядок: тело =
 * `randomString(randomLengthInRange(...))`, затем `applyCase` к ТЕЛУ, затем
 * `prefix + body + suffix` (литеральные prefix/suffix НЕ меняются регистром).
 * Параметры считаются валидными.
 *
 * @param params Параметры генерации.
 * @param src Источник случайности (по умолчанию crypto).
 * @returns Массив сгенерированных строк.
 */
export function batch(params: RandomStringsParams, src: RandomSource = secureRandom): string[] {
  const alphabet = buildAlphabet(params.alphabet);
  const out: string[] = new Array<string>(params.count);
  for (let i = 0; i < params.count; i++) {
    const len = randomLengthInRange(params.lengthFrom, params.lengthTo, src);
    const body = applyCase(randomString(len, alphabet, src), params.caseTransform);
    out[i] = params.prefix + body + params.suffix;
  }
  return out;
}

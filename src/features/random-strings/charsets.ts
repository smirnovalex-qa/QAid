/**
 * Наборы символов для генератора случайных строк.
 *
 * Каждый набор — `readonly string[]` из одиночных «графем» (НЕ склеенная строка),
 * поэтому эмодзи и суррогатные пары никогда не разбиваются при индексации.
 * Чистый модуль: без preact/DOM/chrome.
 */

/** Латиница строчная: 'a'..'z'. */
export const LATIN_LOWER: readonly string[] = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(97 + i),
);

/** Латиница заглавная: 'A'..'Z'. */
export const LATIN_UPPER: readonly string[] = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i),
);

/** Кириллица строчная: 'а'..'я' + 'ё'. */
export const CYRILLIC_LOWER: readonly string[] = [
  ...Array.from({ length: 32 }, (_, i) => String.fromCharCode(0x430 + i)), // а..я
  'ё',
];

/** Кириллица заглавная: 'А'..'Я' + 'Ё'. */
export const CYRILLIC_UPPER: readonly string[] = [
  ...Array.from({ length: 32 }, (_, i) => String.fromCharCode(0x410 + i)), // А..Я
  'Ё',
];

/** Цифры: '0'..'9'. */
export const DIGITS: readonly string[] = Array.from({ length: 10 }, (_, i) => String(i));

/** Безопасный набор пунктуации. */
export const SPECIAL: readonly string[] = [
  '!',
  '@',
  '#',
  '$',
  '%',
  '^',
  '&',
  '*',
  '(',
  ')',
  '-',
  '_',
  '=',
  '+',
  '[',
  ']',
  '{',
  '}',
  ';',
  ':',
  ',',
  '.',
  '?',
  '/',
];

/**
 * Курируемый набор одиночных эмодзи БЕЗ ZWJ-последовательностей —
 * так подсчёт графем остаётся простым (одна графема на кодовую точку/пару).
 */
export const EMOJI: readonly string[] = [
  '😀',
  '😎',
  '🤖',
  '🎉',
  '🔥',
  '🚀',
  '⭐',
  '🍀',
  '🌈',
  '🐱',
  '🐶',
  '🍕',
  '⚡',
  '💡',
  '🎯',
  '🧪',
];

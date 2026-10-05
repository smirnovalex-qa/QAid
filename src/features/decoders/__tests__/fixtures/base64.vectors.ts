/**
 * Известные векторы Base64 (RFC 4648 §10) для standard-алфавита + набор
 * Unicode-строк для проверки round-trip через собственный UTF-8-кодек.
 */

/** RFC 4648 §10: вход → стандартный Base64 (с паддингом). */
export const RFC4648_VECTORS: readonly { readonly input: string; readonly base64: string }[] = [
  { input: '', base64: '' },
  { input: 'f', base64: 'Zg==' },
  { input: 'fo', base64: 'Zm8=' },
  { input: 'foo', base64: 'Zm9v' },
  { input: 'foob', base64: 'Zm9vYg==' },
  { input: 'fooba', base64: 'Zm9vYmE=' },
  { input: 'foobar', base64: 'Zm9vYmFy' },
];

/** Unicode-строки для проверки round-trip (encode→decode === исходник). */
export const UNICODE_SAMPLES: readonly string[] = [
  'Привет, мир', // кириллица
  '日本語のテキスト', // CJK
  '😀🎉👍 emoji', // эмодзи (суррогатные пары)
  'Ĝêđ ñå Ünïçödé', // диакритика
];

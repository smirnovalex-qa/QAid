/**
 * Пограничные ветки декодеров: собственный JSON-сканер позиций ошибок
 * (`scanJsonError` через `validateJson`) и достижимые catch-пути Base64/URL/JWT.
 *
 * Цель — довести `logic.ts` до порога core-покрытия (TASK-011): сканер имеет
 * богатую структуру (строки/числа/массивы/объекты/литералы), поэтому проверяем
 * offset первого дефекта на представителе каждой ветки.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_BYTES,
  decodeBase64,
  decodeJwt,
  decodeUrl,
  encodeBase64,
  encodeUrl,
  minifyJson,
  prettyJson,
  validateJson,
} from '../logic';
import { makeJwt } from './fixtures/jwt.samples';

/** Удобный доступ к offset ошибки валидации JSON. */
function errorOffset(input: string): number {
  const result = validateJson(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('unreachable');
  expect(result.error.position).toBeDefined();
  return result.error.position?.offset ?? -1;
}

describe('validateJson — позиция ошибки (собственный сканер)', () => {
  it.each([
    ['объект: значение отсутствует', '{"a":}', 5],
    ['объект: пропущено двоеточие', '{"a" 1}', 5],
    ['объект: висячая запятая', '{"k":"v",}', 9],
    ['массив: пропущена запятая', '[1 2]', 3],
    ['массив: висячая запятая', '[1,2,]', 5],
    ['массив: висячая запятая после null', '[null,]', 6],
    ['массив: висячая запятая после true/false', '[true,false,]', 12],
    ['строка: битый \\u-escape', '"\\uZZ"', 3],
    ['строка: недопустимый escape', '"a\\q"', 3],
    ['строка: не закрыта', '"abc', 4],
    ['мусор после значения', 'truex', 4],
    ['число с экспонентой без хвоста', '1e', 2],
    ['усечённый литерал', 'nul', 0],
  ])('%s → offset %i', (_name, input, offset) => {
    expect(errorOffset(input)).toBe(offset);
  });

  it('корректный \\t-escape внутри строки не мешает найти ошибку дальше', () => {
    // parseString проходит валидный '\t', ошибка — на висячей запятой массива.
    expect(errorOffset('["x\\ty",]')).toBe(8);
  });

  it('вложенный объект: ошибка во внутреннем значении', () => {
    // '{"a":{"b":}}' — внутренний объект без значения ключа "b".
    expect(errorOffset('{"a":{"b":}}')).toBe(10);
  });

  it('многострочный JSON: line/column считаются по переводам строк', () => {
    const result = validateJson('{\n  "a": 1,\n  "b":\n}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.position?.line).toBeGreaterThanOrEqual(3);
  });

  it('валидный JSON проходит', () => {
    const result = validateJson('{"a":[1,2,{"b":true}],"c":null}');
    expect(result.ok).toBe(true);
  });

  it.each([
    ['валидный \\u-escape, затем ошибка', '["\\u0041",]', 10],
    ['дробное число, затем ошибка массива', '[1.5 2]', 5],
    ['отрицательное число, затем висячая запятая', '[-5,]', 4],
    ['экспонента со знаком, затем висячая запятая', '[1e+5,]', 6],
    ['обрыв на ожидании значения', '[', 1],
    ['пустой объект в массиве, висячая запятая', '[{},]', 4],
    ['полный объект в массиве, висячая запятая', '[{"a":1},]', 9],
    ['пустой массив в массиве, висячая запятая', '[[],]', 4],
    ['массив со значением в массиве, висячая запятая', '[[1],]', 5],
    ['объект: мусор после члена', '{"a":1 2}', 7],
  ])('%s → offset %i', (_name, input, offset) => {
    expect(errorOffset(input)).toBe(offset);
  });
});

describe('prettyJson / minifyJson', () => {
  it('pretty форматирует с отступом', () => {
    const result = prettyJson('{"a":1}', { indent: 2 });
    expect(result.ok && result.value).toBe('{\n  "a": 1\n}');
  });

  it('minify схлопывает пробелы', () => {
    const result = minifyJson('{ "a" : 1 }');
    expect(result.ok && result.value).toBe('{"a":1}');
  });

  it('pretty пробрасывает ошибку разбора', () => {
    const result = prettyJson('{bad', { indent: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
  });

  it('minify пробрасывает ошибку разбора', () => {
    const result = minifyJson('{bad');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
  });
});

describe('Base64 — кодирование остатков и недостижимые алфавиту символы', () => {
  it.each([
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
  ])('encode(%s) с паддингом → %s', (input, expected) => {
    const result = encodeBase64(input, { variant: 'standard', padding: true });
    expect(result.ok && result.value).toBe(expected);
  });

  it('url-safe без паддинга заменяет +/ и срезает =', () => {
    const result = encodeBase64('<<<>>>', { variant: 'url-safe', padding: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toMatch(/[+/=]/);
  });

  it('символ вне однобайтового диапазона → invalid-base64', () => {
    // 'Ā' (U+0100) имеет charCode ≥ 256 → ветка code < 256 ? … : -1.
    const result = decodeBase64('ĀĀĀĀ', { variant: 'standard' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-base64');
  });
});

describe('URL — достижимые catch-ветки', () => {
  it('encode одиночного суррогата → invalid-url-escape', () => {
    const result = encodeUrl('\uD800', 'component');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-url-escape');
  });

  it('decode синтаксически валидного, но битого по UTF-8 escape → invalid-url-escape с позицией', () => {
    const result = decodeUrl('%C0%80', 'component');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-url-escape');
    expect(result.error.position?.offset).toBe(0);
  });

  it('full-режим: encodeURI/decodeURI round-trip', () => {
    const encoded = encodeUrl('a b/c', 'full');
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeUrl(encoded.value, 'full');
    expect(decoded.ok && decoded.value).toBe('a b/c');
  });
});

describe('JWT — ветки декодирования сегментов', () => {
  it('сегмент — валидный base64url, но битый UTF-8 → malformed-jwt', () => {
    // 'wIA' = base64url байтов [0xC0, 0x80] — недопустимая UTF-8 последовательность.
    const result = decodeJwt('wIA.wIA.sig');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('malformed-jwt');
  });

  it('сегмент — валидный UTF-8, но не JSON → malformed-jwt', () => {
    // 'aGVsbG8' = base64url 'hello'.
    const result = decodeJwt('aGVsbG8.aGVsbG8.sig');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('malformed-jwt');
  });

  it('сегмент — JSON-примитив, а не объект → malformed-jwt', () => {
    // 'MTIz' = base64url '123'.
    const result = decodeJwt('MTIz.MTIz.s');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('malformed-jwt');
  });

  it('экстремальный exp даёт невалидную дату — timeClaim не бросает', () => {
    const token = makeJwt({ alg: 'HS256', typ: 'JWT' }, { exp: 1e15 });
    const result = decodeJwt(token, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Дата за пределами диапазона → iso пустой, localeString — запасная строка.
    expect(result.value.claims.exp?.iso).toBe('');
    expect(result.value.claims.exp?.localeString).toBe(String(1e15));
  });
});

describe('guardInput — границы размера входа', () => {
  it('пустой вход → empty-input', () => {
    const result = validateJson('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('empty-input');
  });

  it('длина строго больше лимита → too-large (быстрый путь по длине)', () => {
    const huge = 'a'.repeat(MAX_INPUT_BYTES + 1);
    const result = validateJson(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too-large');
  });

  it('серая зона: length·3 > лимита, но байтов под лимитом → проходит проверку размера', () => {
    // 2·10^6 ASCII-символов: length·3 = 6·10^6 > 5 MiB, но байтов = 2·10^6 < лимита.
    const gray = 'a'.repeat(2_000_000);
    const result = validateJson(gray);
    // Это валидная по размеру строка (JSON невалиден — важно лишь, что не too-large).
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-json');
  });

  it('серая зона: многобайтовые символы перекрывают лимит → too-large (точный подсчёт)', () => {
    // 2·10^6 символов '€' (3 байта) = 6·10^6 байт > лимита, но length < лимита.
    const grayOver = '€'.repeat(2_000_000);
    const result = validateJson(grayOver);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too-large');
  });
});

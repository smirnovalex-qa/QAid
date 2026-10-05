/**
 * Чистая логика фичи «Декодеры» (JWT · Base64 · URL · JSON) — без Preact/DOM/chrome.
 *
 * Все публичные функции возвращают дискриминируемый {@link DecodeResult} и
 * НИКОГДА не бросают на любой (в т.ч. состязательный/фаззинговый) вход: рискованное
 * тело обёрнуто в try/catch. Используются только стандартные Web/JS API, доступные
 * в worker-подобном контексте: `TextEncoder`/`TextDecoder`/`Intl`/`JSON`.
 */

import { MAX_INPUT_BYTES } from './types';
import type {
  Base64Options,
  Base64Variant,
  DecodeError,
  DecodeErr,
  DecodeErrorKind,
  DecodeResult,
  JsonFormatOptions,
  JwtClaimsView,
  JwtDecoded,
  JwtTimeClaim,
  TextPosition,
  UrlMode,
} from './types';

export { MAX_INPUT_BYTES } from './types';
export type {
  Base64Options,
  Base64Variant,
  DecodeError,
  DecodeErr,
  DecodeOk,
  DecodeErrorKind,
  DecodeResult,
  JsonFormatOptions,
  JwtClaimsView,
  JwtDecoded,
  JwtTimeClaim,
  TextPosition,
  UrlMode,
} from './types';

// ── Алфавиты и обратные таблицы Base64 ───────────────────────────────────────

const STD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Строит обратную таблицу code→value (Int16Array, -1 для не-алфавитных байт). */
function buildReverse(alphabet: string): Int16Array {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
}

const STD_REVERSE = buildReverse(STD_ALPHABET);
const URL_REVERSE = buildReverse(URL_ALPHABET);

// ── Ошибки ───────────────────────────────────────────────────────────────────

const MESSAGE_KEYS: Record<DecodeErrorKind, string> = {
  'invalid-base64': 'dec.err.invalid_base64',
  'invalid-utf8': 'dec.err.invalid_utf8',
  'malformed-jwt': 'dec.err.malformed_jwt',
  'invalid-json': 'dec.err.invalid_json',
  'invalid-url-escape': 'dec.err.invalid_url_escape',
  'empty-input': 'dec.err.empty_input',
  'too-large': 'dec.err.too_large',
};

/** Собирает {@link DecodeErr}; `position` домешивается условно (exactOptionalPropertyTypes). */
function fail(kind: DecodeErrorKind, message: string, position?: TextPosition): DecodeErr {
  const error: DecodeError =
    position !== undefined
      ? { kind, message, messageKey: MESSAGE_KEYS[kind], position }
      : { kind, message, messageKey: MESSAGE_KEYS[kind] };
  return { ok: false, error };
}

/**
 * Общая проверка входа: пустая строка → `empty-input`, превышение лимита → `too-large`.
 *
 * Размер оценивается ступенчато, чтобы не кодировать гигантский вход дважды:
 * UTF-8 даёт от 1 до 3 байт на код-юнит UTF-16 (суррогатная пара — 2 юнита → 4 байта,
 * т.е. ≤ 3·length), поэтому `length·3 ≤ MAX` гарантирует «под лимитом», а `length > MAX`
 * гарантирует «над лимитом»; точный TextEncoder вызывается лишь в «серой зоне».
 *
 * @param input Входная строка.
 * @returns Ошибку-guard либо `null`, если вход валиден по размеру.
 */
function guardInput(input: string): DecodeErr | null {
  if (input === '') return fail('empty-input', 'Input is empty');
  if (input.length * 3 <= MAX_INPUT_BYTES) return null;
  if (input.length > MAX_INPUT_BYTES) return fail('too-large', 'Input exceeds size limit');
  const bytes = new TextEncoder().encode(input).length;
  if (bytes > MAX_INPUT_BYTES) return fail('too-large', 'Input exceeds size limit');
  return null;
}

/** Переводит 0-based `offset` в позицию {line, column} (1-based), считая переводы строк. */
function toPosition(text: string, offset: number): TextPosition {
  const bound = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let column = 1;
  for (let i = 0; i < bound; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { offset, line, column };
}

// ── Base64 ───────────────────────────────────────────────────────────────────

/** Кодирует байты в стандартный Base64 (с паддингом). */
function bytesToStandardBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  for (; i + 2 < len; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      STD_ALPHABET.charAt((n >>> 18) & 63) +
      STD_ALPHABET.charAt((n >>> 12) & 63) +
      STD_ALPHABET.charAt((n >>> 6) & 63) +
      STD_ALPHABET.charAt(n & 63);
  }
  const rem = len - i;
  if (rem === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += STD_ALPHABET.charAt((n >>> 18) & 63) + STD_ALPHABET.charAt((n >>> 12) & 63) + '==';
  } else if (rem === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out +=
      STD_ALPHABET.charAt((n >>> 18) & 63) +
      STD_ALPHABET.charAt((n >>> 12) & 63) +
      STD_ALPHABET.charAt((n >>> 6) & 63) +
      '=';
  }
  return out;
}

/**
 * Декодирует Base64-строку в байты, выбирая алфавит по варианту.
 *
 * Нормализует пробелы/переводы строк, принимает отсутствующий паддинг, отвергает
 * символы вне алфавита (→ `invalid-base64`). Одиночный «висячий» символ
 * (length % 4 === 1) недопустим.
 */
function base64ToBytes(input: string, variant: Base64Variant): DecodeResult<Uint8Array> {
  const cleaned = input.replace(/\s/g, '').replace(/=+$/, '');
  if (cleaned === '') return fail('empty-input', 'Input is empty');
  if (cleaned.length % 4 === 1) return fail('invalid-base64', 'Invalid Base64 length');

  const reverse = variant === 'url-safe' ? URL_REVERSE : STD_REVERSE;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    const value = code < 256 ? (reverse[code] ?? -1) : -1;
    if (value < 0) return fail('invalid-base64', `Invalid Base64 character at ${String(i)}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  return { ok: true, value: Uint8Array.from(out) };
}

/**
 * Кодирует строку в Base64 (собственный кодек поверх UTF-8, не `btoa`).
 *
 * @param input Исходная строка.
 * @param opts Вариант алфавита и наличие паддинга.
 * @returns Base64-строка либо ошибка.
 */
export function encodeBase64(input: string, opts: Base64Options): DecodeResult<string> {
  const guard = guardInput(input);
  if (guard) return guard;
  try {
    const bytes = new TextEncoder().encode(input);
    let b64 = bytesToStandardBase64(bytes);
    if (opts.variant === 'url-safe') b64 = b64.replace(/\+/g, '-').replace(/\//g, '_');
    if (!opts.padding) b64 = b64.replace(/=+$/, '');
    return { ok: true, value: b64 };
  } catch {
    return fail('invalid-base64', 'Failed to encode Base64');
  }
}

/**
 * Декодирует Base64-строку в текст (UTF-8, `fatal`: битый UTF-8 → `invalid-utf8`).
 *
 * @param input Base64-строка.
 * @param opts Вариант алфавита.
 * @returns Декодированный текст либо ошибка.
 */
export function decodeBase64(
  input: string,
  opts: Pick<Base64Options, 'variant'>,
): DecodeResult<string> {
  const guard = guardInput(input);
  if (guard) return guard;
  try {
    const bytes = base64ToBytes(input, opts.variant);
    if (!bytes.ok) return bytes;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.value);
      return { ok: true, value: text };
    } catch {
      return fail('invalid-utf8', 'Decoded bytes are not valid UTF-8');
    }
  } catch {
    return fail('invalid-base64', 'Failed to decode Base64');
  }
}

// ── URL ──────────────────────────────────────────────────────────────────────

const HEX = /[0-9A-Fa-f]/;

/**
 * Кодирует строку для URL: `component` → encodeURIComponent, `full` → encodeURI.
 */
export function encodeUrl(input: string, mode: UrlMode): DecodeResult<string> {
  const guard = guardInput(input);
  if (guard) return guard;
  try {
    const value = mode === 'component' ? encodeURIComponent(input) : encodeURI(input);
    return { ok: true, value };
  } catch {
    // Одиночный суррогат UTF-16 не кодируется в URL.
    return fail('invalid-url-escape', 'Input cannot be URL-encoded');
  }
}

/**
 * Декодирует URL-строку: `component` → decodeURIComponent, `full` → decodeURI.
 *
 * Битые `%`-escape (`%`, `%G1`, обрезанный `%2`) → `invalid-url-escape` с позицией
 * провинившегося `%`.
 */
export function decodeUrl(input: string, mode: UrlMode): DecodeResult<string> {
  const guard = guardInput(input);
  if (guard) return guard;
  // Предварительный скан синтаксиса escape-последовательностей — чтобы дать точную позицию.
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) !== 37 /* % */) continue;
    const h1 = input[i + 1];
    const h2 = input[i + 2];
    if (h1 === undefined || h2 === undefined || !HEX.test(h1) || !HEX.test(h2)) {
      return fail('invalid-url-escape', 'Malformed percent-escape', toPosition(input, i));
    }
  }
  try {
    const value = mode === 'component' ? decodeURIComponent(input) : decodeURI(input);
    return { ok: true, value };
  } catch {
    // Синтаксис корректен, но байты не складываются в валидный UTF-8: указываем на первый `%`.
    const at = input.indexOf('%');
    const position = toPosition(input, at < 0 ? 0 : at);
    return fail('invalid-url-escape', 'Invalid percent-encoded sequence', position);
  }
}

// ── JSON ─────────────────────────────────────────────────────────────────────

/** Ошибка собственного сканера JSON: несёт offset первого дефекта. */
class JsonScanError extends Error {
  constructor(readonly offset: number) {
    super('json-scan');
  }
}

/**
 * Находит offset первой синтаксической ошибки JSON собственным сканером.
 *
 * Движко-независимо: сообщения V8 не всегда содержат числовую позицию (в
 * актуальных версиях многие ошибки идут как `Unexpected token 'X', "…"`), а
 * критерий требует точную позицию. Возвращает длину ввода при «обрыве» и `0`,
 * если ошибку локализовать не удалось. Предполагается невалидный вход
 * (вызывается только после провала `JSON.parse`).
 */
function scanJsonError(input: string): number {
  const n = input.length;
  let i = 0;
  const isWs = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isDigit = (c: string): boolean => c >= '0' && c <= '9';
  const skipWs = (): void => {
    while (i < n && isWs(input.charAt(i))) i++;
  };
  const at = (): number => (i >= n ? n : i);

  const parseString = (): void => {
    i++; // открывающая кавычка
    while (i < n) {
      const c = input.charAt(i);
      if (c === '"') {
        i++;
        return;
      }
      if (c === '\\') {
        i++;
        const e = input.charAt(i);
        if (e === 'u') {
          for (let k = 0; k < 4; k++) {
            i++;
            if (!/[0-9a-fA-F]/.test(input.charAt(i))) throw new JsonScanError(i);
          }
          i++;
        } else if (e !== '' && '"\\/bfnrt'.includes(e)) {
          i++;
        } else {
          throw new JsonScanError(i);
        }
      } else {
        i++;
      }
    }
    throw new JsonScanError(n); // незакрытая строка
  };

  const parseNumber = (): void => {
    const start = i;
    if (input.charAt(i) === '-') i++;
    while (i < n && isDigit(input.charAt(i))) i++;
    if (input.charAt(i) === '.') {
      i++;
      while (i < n && isDigit(input.charAt(i))) i++;
    }
    if (input.charAt(i) === 'e' || input.charAt(i) === 'E') {
      i++;
      if (input.charAt(i) === '+' || input.charAt(i) === '-') i++;
      while (i < n && isDigit(input.charAt(i))) i++;
    }
    if (i === start) throw new JsonScanError(i);
  };

  const parseValue = (): void => {
    skipWs();
    if (i >= n) throw new JsonScanError(n);
    const c = input.charAt(i);
    if (c === '{') {
      parseObject();
      return;
    }
    if (c === '[') {
      parseArray();
      return;
    }
    if (c === '"') {
      parseString();
      return;
    }
    if (c === '-' || isDigit(c)) {
      parseNumber();
      return;
    }
    if (input.startsWith('true', i)) {
      i += 4;
      return;
    }
    if (input.startsWith('false', i)) {
      i += 5;
      return;
    }
    if (input.startsWith('null', i)) {
      i += 4;
      return;
    }
    throw new JsonScanError(i);
  };

  function parseObject(): void {
    i++; // '{'
    skipWs();
    if (input.charAt(i) === '}') {
      i++;
      return;
    }
    for (;;) {
      skipWs();
      if (input.charAt(i) !== '"') throw new JsonScanError(at());
      parseString();
      skipWs();
      if (input.charAt(i) !== ':') throw new JsonScanError(at());
      i++;
      parseValue();
      skipWs();
      const c = input.charAt(i);
      if (c === ',') {
        i++;
        continue;
      }
      if (c === '}') {
        i++;
        return;
      }
      throw new JsonScanError(at());
    }
  }

  function parseArray(): void {
    i++; // '['
    skipWs();
    if (input.charAt(i) === ']') {
      i++;
      return;
    }
    for (;;) {
      parseValue();
      skipWs();
      const c = input.charAt(i);
      if (c === ',') {
        i++;
        continue;
      }
      if (c === ']') {
        i++;
        return;
      }
      throw new JsonScanError(at());
    }
  }

  try {
    parseValue();
    skipWs();
    return i < n ? i : n; // мусор после значения → его offset; иначе конец
  } catch (e) {
    // JsonScanError несёт offset; любой иной сбой (напр. переполнение стека на
    // патологической вложенности) не должен «протекать» — возвращаем 0.
    return e instanceof JsonScanError ? e.offset : 0;
  }
}

/** Вычисляет {@link TextPosition} первой ошибки JSON (движко-независимо). */
function jsonErrorPosition(input: string): TextPosition {
  return toPosition(input, scanJsonError(input));
}

/**
 * Валидирует JSON. При ошибке вычисляет точную {@link TextPosition}.
 *
 * @param input Строка JSON.
 * @returns Разобранное значение либо ошибка с позицией.
 */
export function validateJson(input: string): DecodeResult<unknown> {
  const guard = guardInput(input);
  if (guard) return guard;
  try {
    const value: unknown = JSON.parse(input);
    return { ok: true, value };
  } catch {
    return fail('invalid-json', 'Invalid JSON', jsonErrorPosition(input));
  }
}

/**
 * Форматирует JSON. `indent: 0` — минификация.
 *
 * Замечание: числовые ключи объектов движок переупорядочивает по возрастанию —
 * это ожидаемое поведение `JSON.stringify`, а не потеря данных.
 *
 * @param input Строка JSON.
 * @param opts Отступ форматирования.
 * @returns Отформатированный JSON либо ошибка.
 */
export function prettyJson(input: string, opts: JsonFormatOptions): DecodeResult<string> {
  const parsed = validateJson(input);
  if (!parsed.ok) return parsed;
  try {
    const value = JSON.stringify(parsed.value, null, opts.indent);
    return { ok: true, value };
  } catch {
    return fail('invalid-json', 'Value cannot be serialized');
  }
}

/**
 * Минифицирует JSON (компактный `JSON.stringify`).
 *
 * @param input Строка JSON.
 * @returns Минифицированный JSON либо ошибка.
 */
export function minifyJson(input: string): DecodeResult<string> {
  const parsed = validateJson(input);
  if (!parsed.ok) return parsed;
  try {
    const value = JSON.stringify(parsed.value);
    return { ok: true, value };
  } catch {
    return fail('invalid-json', 'Value cannot be serialized');
  }
}

// ── JWT ──────────────────────────────────────────────────────────────────────

/** Проверяет, что значение — «простой» объект (Record), а не массив/примитив/null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Возвращает конечное число либо `undefined` (для exp/iat/nbf). */
function numberClaim(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Строит {@link JwtTimeClaim}; невалидную дату не роняет, а отдаёт запасные строки. */
function timeClaim(sec: number): JwtTimeClaim {
  try {
    const date = new Date(sec * 1000);
    if (Number.isNaN(date.getTime())) {
      return { epochSeconds: sec, iso: '', localeString: String(sec) };
    }
    return {
      epochSeconds: sec,
      iso: date.toISOString(),
      localeString: new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'long',
      }).format(date),
    };
  } catch {
    return { epochSeconds: sec, iso: '', localeString: String(sec) };
  }
}

/** Декодирует base64url-сегмент JWT в JSON-объект. */
function decodeJwtSegment(segment: string): DecodeResult<Record<string, unknown>> {
  const decoded = base64ToBytes(segment, 'url-safe');
  if (!decoded.ok) return fail('malformed-jwt', 'JWT segment is not valid base64url');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(decoded.value);
  } catch {
    return fail('malformed-jwt', 'JWT segment is not valid UTF-8');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail('malformed-jwt', 'JWT segment is not valid JSON');
  }
  if (!isRecord(value)) return fail('malformed-jwt', 'JWT segment is not a JSON object');
  return { ok: true, value };
}

/**
 * Декодирует JWT (БЕЗ проверки подписи).
 *
 * Требует ровно 3 сегмента; unsecured `alg:none` (пустой 3-й сегмент) допустим
 * (`signaturePresent = false`). exp/iat/nbf (epoch-секунды) разворачиваются в
 * {@link JwtTimeClaim}. `expired`/`notYetValid` считаются относительно `now`.
 *
 * @param token Компактный JWT.
 * @param now Текущее время в секундах (по умолчанию Date.now()/1000).
 * @returns Разобранный токен либо ошибка `malformed-jwt`.
 */
export function decodeJwt(
  token: string,
  now: number = Date.now() / 1000,
): DecodeResult<JwtDecoded> {
  const guard = guardInput(token);
  if (guard) return guard;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return fail('malformed-jwt', 'JWT must have exactly 3 segments');
    const headerSeg = parts[0] ?? '';
    const payloadSeg = parts[1] ?? '';
    const signatureSeg = parts[2] ?? '';

    const header = decodeJwtSegment(headerSeg);
    if (!header.ok) return header;
    const payload = decodeJwtSegment(payloadSeg);
    if (!payload.ok) return payload;

    const exp = numberClaim(payload.value.exp);
    const iat = numberClaim(payload.value.iat);
    const nbf = numberClaim(payload.value.nbf);
    const expired = exp !== undefined && exp < now;
    const notYetValid = nbf !== undefined && nbf > now;

    const claims: JwtClaimsView = {
      ...(exp !== undefined ? { exp: timeClaim(exp) } : {}),
      ...(iat !== undefined ? { iat: timeClaim(iat) } : {}),
      ...(nbf !== undefined ? { nbf: timeClaim(nbf) } : {}),
      expired,
      notYetValid,
    };

    return {
      ok: true,
      value: {
        header: header.value,
        payload: payload.value,
        signaturePresent: signatureSeg !== '',
        signatureRaw: signatureSeg,
        claims,
        raw: { header: headerSeg, payload: payloadSeg, signature: signatureSeg },
      },
    };
  } catch {
    return fail('malformed-jwt', 'Failed to decode JWT');
  }
}

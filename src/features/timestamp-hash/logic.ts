/**
 * Чистая логика фичи «Таймстемпы и хеши» — без Preact/DOM/платформы.
 *
 * Разрешено: `crypto.*` (subtle/randomUUID/getRandomValues), `Intl`,
 * `TextEncoder`. Все «плохие» входы возвращают дискриминированный `Result`,
 * а не бросают (кроме `hashText` — см. контракт ниже).
 */

import { uuidV4 as generateUuidV4, isUuidV4 as sharedIsUuidV4 } from '@/shared/test-data/smart';
import { MAX_EPOCH_MS, MAX_UUID_BATCH } from './types';
import type { DateDiff, Err, HashResult, Result, ShaAlgo, TimestampView, UnixUnit } from './types';

export { MAX_EPOCH_MS, MAX_UUID_BATCH } from './types';
export type {
  DateDiff,
  Err,
  HashEncoding,
  HashResult,
  Ok,
  Result,
  ShaAlgo,
  TimestampView,
  UnixUnit,
} from './types';

/** Конструктор ошибки-результата. */
function fail(kind: string, messageKey: string, message: string): Err {
  return { ok: false, error: { kind, messageKey, message } };
}

// — Хелперы форматирования —

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

// ————————————————————————— Таймстемпы —————————————————————————

/**
 * Разбирает unix-строку в миллисекунды эпохи.
 *
 * @param input Строка (обрезается по краям).
 * @param unit Единица входа: секунды или миллисекунды.
 * @returns `Ok(epochMs)` либо ошибку `invalid-number` / `range`.
 */
export function parseUnix(input: string, unit: UnixUnit): Result<number> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return fail('invalid-number', 'tsh.err.number', 'empty input');
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return fail('invalid-number', 'tsh.err.number', 'not a finite number');
  }
  const epochMs = unit === 'seconds' ? n * 1000 : n;
  if (Math.abs(epochMs) > MAX_EPOCH_MS) {
    return fail('range', 'tsh.err.range', 'value out of Date range');
  }
  return { ok: true, value: epochMs };
}

/** Проверяет IANA-зону через попытку построить `Intl.DateTimeFormat`. */
function isValidZone(zone: string): boolean {
  if (zone === 'UTC') return true;
  if (zone === '') return false;
  try {
    // Бросит RangeError при неизвестной/пустой зоне.
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

interface ZoneParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

/** Форматирует момент в «стенное» время указанной зоны (для DST-корректного смещения). */
function zoneParts(epochMs: number, zone: string): ZoneParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  // Некоторые движки дают '24' для полуночи — нормализуем в 0.
  let h = Number(map.hour ?? '0');
  if (h === 24) h = 0;
  return {
    y: Number(map.year ?? '0'),
    mo: Number(map.month ?? '0'),
    d: Number(map.day ?? '0'),
    h,
    mi: Number(map.minute ?? '0'),
    s: Number(map.second ?? '0'),
  };
}

/**
 * Строит представление момента в заданной зоне (смещение считается ДЛЯ этого
 * момента — DST-корректно).
 *
 * @param epochMs Эпоха в миллисекундах.
 * @param zone IANA-идентификатор или `UTC`.
 * @returns `Ok(TimestampView)` либо ошибку `range` / `invalid-zone`.
 */
export function fromEpochMs(epochMs: number, zone: string): Result<TimestampView> {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > MAX_EPOCH_MS) {
    return fail('range', 'tsh.err.range', 'epoch out of Date range');
  }
  if (!isValidZone(zone)) {
    return fail('invalid-zone', 'tsh.err.zone', 'unknown time zone');
  }
  const parts = zoneParts(epochMs, zone);
  // Стенное время зоны, интерпретированное как UTC, минус реальная эпоха = смещение.
  const asUtc = Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s);
  const offsetMinutes = Math.round((asUtc - epochMs) / 60000);
  const inZone = `${pad4(parts.y)}-${pad2(parts.mo)}-${pad2(parts.d)} ${pad2(parts.h)}:${pad2(
    parts.mi,
  )}:${pad2(parts.s)}`;
  const view: TimestampView = {
    epochMs,
    epochSeconds: Math.floor(epochMs / 1000),
    iso: new Date(epochMs).toISOString(),
    inZone,
    zone,
    offsetMinutes,
  };
  return { ok: true, value: view };
}

/**
 * Разбирает ISO-8601 строку и строит представление в заданной зоне.
 *
 * @param iso Строка ISO-8601 (любой валидный для `Date` формат).
 * @param zone IANA-идентификатор или `UTC`.
 * @returns `Ok(TimestampView)` либо ошибку `invalid-iso` / `invalid-zone`.
 */
export function fromIso(iso: string, zone: string): Result<TimestampView> {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return fail('invalid-iso', 'tsh.err.iso', 'invalid ISO-8601 string');
  }
  return fromEpochMs(d.getTime(), zone);
}

/**
 * Знаковая разница `b - a`, разложенная на дни/часы/минуты/секунды.
 *
 * @param aEpochMs Первый момент (мс).
 * @param bEpochMs Второй момент (мс).
 * @returns Разложенная разница + нейтральная строка `humanized`.
 */
export function diff(aEpochMs: number, bEpochMs: number): DateDiff {
  const ms = bEpochMs - aEpochMs;
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const humanized = `${String(days)}d ${String(hours)}h ${String(minutes)}m ${String(seconds)}s`;
  return { ms, absMs, days, hours, minutes, seconds, humanized };
}

// ————————————————————————— Хеши —————————————————————————

/**
 * Переводит байты в hex-строку нижнего регистра фиксированной длины.
 *
 * @param bytes Входные байты.
 * @returns Hex-представление (2 символа на байт).
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Переводит байты в стандартный base64 (с паддингом `=`), без `btoa`/`Buffer`.
 *
 * @param bytes Входные байты.
 * @returns Base64-строка.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < len ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < len ? (bytes[i + 2] ?? 0) : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64_ALPHABET[(triple >>> 18) & 0x3f] ?? '';
    out += B64_ALPHABET[(triple >>> 12) & 0x3f] ?? '';
    out += i + 1 < len ? (B64_ALPHABET[(triple >>> 6) & 0x3f] ?? '') : '=';
    out += i + 2 < len ? (B64_ALPHABET[triple & 0x3f] ?? '') : '=';
  }
  return out;
}

/**
 * Хеширует текст через Web Crypto (`crypto.subtle.digest`).
 *
 * ВНИМАНИЕ: возвращает `HashResult` напрямую (не `Result`). Если `crypto.subtle`
 * недоступен — бросает `Error` (гарантированно доступен в Node 20 и в MV3).
 *
 * @param text Входной текст (кодируется в UTF-8).
 * @param algo Алгоритм SHA-1/256/384/512.
 * @returns Результат с hex и base64.
 */
export async function hashText(text: string, algo: ShaAlgo): Promise<HashResult> {
  if (typeof crypto.subtle.digest !== 'function') {
    throw new Error('crypto.subtle unavailable');
  }
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  const bytes = new Uint8Array(buf);
  return { algo, hex: bytesToHex(bytes), base64: bytesToBase64(bytes) };
}

// — MD5 (RFC 1321) —
//
// ВНИМАНИЕ: MD5 КРИПТОГРАФИЧЕСКИ СЛОМАН (коллизии) — только для legacy-совместимости
// (контрольные суммы, старые API). НИКОГДА не использовать для безопасности.
// Своя компактная реализация: в Web Crypto MD5 отсутствует, тянуть зависимость незачем.

/** Константы K[i] = floor(abs(sin(i+1)) * 2^32). */
const MD5_K: readonly number[] = Array.from({ length: 64 }, (_unused, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296),
);

/** Величины сдвигов по раундам. */
const MD5_S: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/** Циклический сдвиг влево 32-битного слова. */
function rotl32(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

/** Little-endian hex одного 32-битного слова. */
function md5Word(x: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += ((x >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * MD5-дайджест текста (нижний hex). Legacy-совместимость, НЕ для безопасности.
 *
 * @param text Входной текст (UTF-8).
 * @returns 32-символьный hex.
 */
export function md5(text: string): string {
  const msg = new TextEncoder().encode(text);
  const n = msg.length;
  const bitLenLo = (n << 3) >>> 0;
  const bitLenHi = (n >>> 29) >>> 0;
  const blocks = ((n + 8) >>> 6) + 1;
  const total = blocks * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[n] = 0x80;
  const lenPos = total - 8;
  buf[lenPos] = bitLenLo & 0xff;
  buf[lenPos + 1] = (bitLenLo >>> 8) & 0xff;
  buf[lenPos + 2] = (bitLenLo >>> 16) & 0xff;
  buf[lenPos + 3] = (bitLenLo >>> 24) & 0xff;
  buf[lenPos + 4] = bitLenHi & 0xff;
  buf[lenPos + 5] = (bitLenHi >>> 8) & 0xff;
  buf[lenPos + 6] = (bitLenHi >>> 16) & 0xff;
  buf[lenPos + 7] = (bitLenHi >>> 24) & 0xff;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const m = new Array<number>(16);
  for (let block = 0; block < blocks; block++) {
    const off = block * 64;
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      m[i] =
        ((buf[j] ?? 0) |
          ((buf[j + 1] ?? 0) << 8) |
          ((buf[j + 2] ?? 0) << 16) |
          ((buf[j + 3] ?? 0) << 24)) >>>
        0;
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const sum = (f + a + (MD5_K[i] ?? 0) + (m[g] ?? 0)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl32(sum, MD5_S[i] ?? 0)) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return md5Word(a0) + md5Word(b0) + md5Word(c0) + md5Word(d0);
}

// ————————————————————————— UUID v4 —————————————————————————
//
// Канон реализации — `@/shared/test-data/smart` (единственный RFC-4122 алгоритм в
// проекте, на криптостойком `secureRandom`). Здесь — тонкая обёртка: быстрый путь
// через нативный `crypto.randomUUID` + реэкспорт валидатора (DRY, ADR/TASK-034).
// Направление зависимости feature→shared допустимо (fitness-инвариант соблюдён).

/**
 * Собирает UUID v4 из энтропии (fallback-путь без `crypto.randomUUID`) —
 * делегирует канонической реализации `shared/test-data`.
 *
 * @returns Строка UUID v4.
 */
export function uuidV4FromEntropy(): string {
  return generateUuidV4();
}

/**
 * UUID v4: быстрый путь через `crypto.randomUUID`, иначе — каноническая сборка из
 * энтропии (`shared/test-data`).
 *
 * @returns Строка UUID v4.
 */
export function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return generateUuidV4();
}

/**
 * Пачка UUID v4; `n` зажимается в `[0, MAX_UUID_BATCH]` (без бросков).
 *
 * @param n Желаемое количество.
 * @returns Массив UUID.
 */
export function uuidV4Batch(n: number): string[] {
  const safe = Number.isFinite(n) ? Math.floor(n) : 0;
  const clamped = Math.max(0, Math.min(MAX_UUID_BATCH, safe));
  const out = new Array<string>(clamped);
  for (let i = 0; i < clamped; i++) {
    out[i] = uuidV4();
  }
  return out;
}

/**
 * Проверяет соответствие строки формату UUID v4 (RFC 4122). Реэкспорт
 * канонического валидатора `shared/test-data` (единый regex на весь проект).
 *
 * @param s Проверяемая строка.
 * @returns `true`, если это валидный UUID v4.
 */
export function isUuidV4(s: string): boolean {
  return sharedIsUuidV4(s);
}

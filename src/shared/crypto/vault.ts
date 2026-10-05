/**
 * Чистое ядро «хранилища секретов» (vault) — БЕЗ `crypto.subtle`, DOM, `chrome.*`
 * и preact. Здесь только форма конверта, валидация недоверенного ввода и кодеки
 * base64. Криптооперации вынесены в соседний `subtle.ts` (seam над Web Crypto).
 *
 * Почему разделение: разбор и валидация персистентного конверта должны быть
 * синхронными, детерминированными и тестируемыми без реального крипто-движка.
 * Любой недоверенный вход (прочитанный из storage/файла) проходит через парсеры,
 * которые НИКОГДА не бросают, а возвращают дискриминированный результат с кодом
 * ошибки — иначе одно повреждённое значение в storage роняет весь попап.
 *
 * Параметры KDF/шифра держим именованными константами (не «магическими числами»),
 * чтобы `needsRekey` мог честно сравнить старый конверт с текущими дефолтами и
 * порекомендовать перешифровку при ужесточении политики (рост числа итераций и т.п.).
 */
import { z } from 'zod';

// ── Параметры KDF и шифра (именованные, без «магических чисел») ────────────────

/** Число итераций PBKDF2 — ориентир OWASP 2023+ для PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

/** Хеш KDF — в конверте храним в нижнем регистре (к Web Crypto маппится в seam). */
export const PBKDF2_HASH = 'sha-256';

/** Длина соли в байтах (128 бит) — своя соль на каждое хранилище. */
export const SALT_BYTES = 16;

/** Длина IV в байтах (96 бит) — своя на КАЖДУЮ запись AES-GCM (критично). */
export const IV_BYTES = 12;

/** Длина ключа AES-GCM в битах. */
export const AES_KEY_BITS = 256;

/** Версия схемы конверта хранилища (инкремент → добавить миграцию ниже). */
export const VAULT_SCHEMA_VERSION = 1;

/** Версия схемы одной зашифрованной записи. */
export const RECORD_SCHEMA_VERSION = 1;

/**
 * Канарейка-контрол: этот известный открытый текст шифруется ключом и кладётся в
 * конверт. Успешная расшифровка канарейки = пароль верный (см. `verifyPassword`).
 */
export const VERIFIER_PLAINTEXT = 'qa-toolbox/vault/verifier/v1';

// ── Форма конверта ────────────────────────────────────────────────────────────

/** Одна зашифрованная запись: IV + шифртекст (с тегом аутентичности GCM), base64. */
export interface EncryptedRecord {
  /** base64, ровно 12 байт после декодирования. */
  readonly iv: string;
  /** base64; выход AES-GCM, включает auth tag. */
  readonly ciphertext: string;
  readonly schemaVersion: number;
}

/** Дескриптор хранилища: параметры KDF, соль и зашифрованная канарейка-верификатор. */
export interface VaultDescriptor {
  readonly kdf: 'pbkdf2';
  readonly hash: 'sha-256';
  readonly iterations: number;
  /** base64, >= 16 байт. */
  readonly salt: string;
  readonly schemaVersion: number;
  /** Зашифрованный `VERIFIER_PLAINTEXT`. */
  readonly verifier: EncryptedRecord;
}

// ── zod-схемы (граница недоверенного ввода) ───────────────────────────────────
//
// `schemaVersion` намеренно `z.number()`, а не `z.literal(...)`: версия проверяется
// ОТДЕЛЬНО в парсере (shape → затем версия), чтобы «слишком новый» конверт давал
// внятный `unsupported-version`, а не сливался в общий `invalid-shape`.

/** Схема зашифрованной записи. */
export const EncryptedRecordSchema: z.ZodType<EncryptedRecord> = z.object({
  iv: z.string(),
  ciphertext: z.string(),
  schemaVersion: z.number(),
});

/** Схема дескриптора хранилища. */
export const VaultDescriptorSchema: z.ZodType<VaultDescriptor> = z.object({
  kdf: z.literal('pbkdf2'),
  hash: z.literal('sha-256'),
  iterations: z.number(),
  salt: z.string(),
  schemaVersion: z.number(),
  verifier: EncryptedRecordSchema,
});

// ── Кодеки base64 (без `btoa`/`atob`/`Buffer`) ────────────────────────────────
//
// Алфавит и энкодер выровнены с `features/timestamp-hash/logic.ts` (единый канон
// base64 в проекте); декодер добавлен здесь, т.к. хранилищу нужен round-trip.

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Обратная таблица символ→значение (undefined для «не из алфавита»). */
const B64_LOOKUP: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    const ch = B64_ALPHABET[i];
    if (ch !== undefined) map[ch] = i;
  }
  return map;
})();

/**
 * Переводит байты в стандартный base64 (с паддингом `=`).
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
 * Декодирует стандартный base64 (с обязательным паддингом до кратности 4) в байты.
 * Строгий: длина должна быть кратна 4, символы — только из алфавита, а `=` —
 * только в хвосте последней группы. Любое нарушение → `null` (НИКОГДА не бросает),
 * чтобы повреждённое значение из storage обрабатывалось как «нет данных».
 *
 * @param b64 Входная base64-строка.
 * @returns Байты, либо `null` при некорректном вводе.
 */
export function base64ToBytes(b64: string): Uint8Array | null {
  const len = b64.length;
  if (len % 4 !== 0) return null;
  if (len === 0) return new Uint8Array(0);

  let padding = 0;
  if (b64[len - 1] === '=') padding++;
  if (b64[len - 2] === '=') padding++;

  const outLen = (len / 4) * 3 - padding;
  const out = new Uint8Array(outLen);
  let o = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = b64[i] ?? '';
    const c1 = b64[i + 1] ?? '';
    const c2 = b64[i + 2] ?? '';
    const c3 = b64[i + 3] ?? '';
    const isLastGroup = i + 4 >= len;

    const v0 = B64_LOOKUP[c0];
    const v1 = B64_LOOKUP[c1];
    // Первые два символа группы паддингом быть не могут.
    if (v0 === undefined || v1 === undefined) return null;

    let v2: number;
    let v3: number;
    if (c2 === '=') {
      // `=` на 3-й позиции допустим только в последней группе и требует `=` на 4-й.
      if (!isLastGroup || c3 !== '=') return null;
      v2 = 0;
      v3 = 0;
    } else {
      const lookup2 = B64_LOOKUP[c2];
      if (lookup2 === undefined) return null;
      v2 = lookup2;
      if (c3 === '=') {
        if (!isLastGroup) return null;
        v3 = 0;
      } else {
        const lookup3 = B64_LOOKUP[c3];
        if (lookup3 === undefined) return null;
        v3 = lookup3;
      }
    }

    const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out[o++] = (triple >>> 16) & 0xff;
    if (o < outLen) out[o++] = (triple >>> 8) & 0xff;
    if (o < outLen) out[o++] = triple & 0xff;
  }
  return out;
}

// ── Политика перешифровки ─────────────────────────────────────────────────────

/**
 * Рекомендуется ли перешифровать (re-key) хранилище: его параметры слабее текущих
 * дефолтов. Причины: другой KDF/хеш (конверт из будущей/чужой схемы), меньше
 * итераций (политику ужесточили) или устаревшая версия схемы. Перешифровка
 * выполняется вызывающим кодом при вводе пароля — здесь только рекомендация.
 *
 * @param d Дескриптор хранилища.
 * @returns `true`, если параметры слабее текущих дефолтов.
 */
export function needsRekey(d: VaultDescriptor): boolean {
  // kdf/hash статически сужены до литералов, но дескриптор мог прийти из более
  // старого/чужого конверта, где значение иное — сравниваем через расширение до
  // string, чтобы защитная проверка оставалась реальной во время выполнения.
  if ((d.kdf as string) !== 'pbkdf2') return true;
  if ((d.hash as string) !== PBKDF2_HASH) return true;
  if (d.iterations < PBKDF2_ITERATIONS) return true;
  if (d.schemaVersion < VAULT_SCHEMA_VERSION) return true;
  return false;
}

// ── Парсеры недоверенного ввода (никогда не бросают) ──────────────────────────

/** Результат разбора: успех со значением либо код ошибки. */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: 'invalid-shape' | 'unsupported-version' };

/**
 * Миграция конверта хранилища с версии `from` на `from + 1`. Локальный минимальный
 * тип (форма как у `EnvelopeMigration` из session-profiles) — задел на будущее:
 * при инкременте `VAULT_SCHEMA_VERSION` сюда добавляется шаг, а парсер прогоняет
 * цепочку вверх до текущей версии ПЕРЕД валидацией схемой.
 */
export interface VaultMigration {
  readonly from: number;
  migrate(prev: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Упорядоченная цепочка миграций (пока пусто — схема одна). Когда появится v2,
 * сюда кладётся `{ from: 1, migrate }`, и парсеры применяют подходящие шаги.
 */
export const VAULT_MIGRATIONS: readonly VaultMigration[] = [];

/**
 * Разбирает и валидирует недоверенный дескриптор. Порядок: форма (zod) → версия.
 * `schemaVersion > VAULT_SCHEMA_VERSION` ⇒ `unsupported-version` (конверт новее, чем
 * этот билд умеет; миграция вверх невозможна). Никогда не бросает.
 *
 * @param raw Недоверенное значение (из storage/файла).
 * @returns Результат разбора.
 */
export function parseVaultDescriptor(raw: unknown): ParseResult<VaultDescriptor> {
  const parsed = VaultDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid-shape' };
  }
  // Хук миграций: при schemaVersion < текущей прогнать VAULT_MIGRATIONS (from→from+1)
  // над сырым объектом до VAULT_SCHEMA_VERSION перед валидацией. Пока версия одна.
  if (parsed.data.schemaVersion > VAULT_SCHEMA_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Разбирает и валидирует недоверенную зашифрованную запись. Порядок тот же:
 * форма → версия. Никогда не бросает.
 *
 * @param raw Недоверенное значение.
 * @returns Результат разбора.
 */
export function parseEncryptedRecord(raw: unknown): ParseResult<EncryptedRecord> {
  const parsed = EncryptedRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid-shape' };
  }
  if (parsed.data.schemaVersion > RECORD_SCHEMA_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }
  return { ok: true, value: parsed.data };
}

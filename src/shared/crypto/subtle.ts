/**
 * Seam над Web Crypto (`crypto.subtle` / `crypto.getRandomValues`) для хранилища
 * секретов. Вся недетерминированность (генерация соли и IV) идёт через
 * ИНЪЕКТИРУЕМЫЙ `ByteSource` — по образцу `shared/random.ts` (инъекция источника
 * случайности) — чтобы тесты были детерминированными БЕЗ мока `crypto.subtle`.
 *
 * Контракт ошибок: `open`/`verifyPassword` НИКОГДА не бросают при неверном пароле,
 * подделанном шифртексте или повреждённом base64 — возвращают типизированный
 * результат/`false`. Провал GCM-тега (подделка/неверный ключ) неотличим от неверного
 * пароля — это by design (аутентифицированное шифрование).
 */
import {
  AES_KEY_BITS,
  IV_BYTES,
  RECORD_SCHEMA_VERSION,
  SALT_BYTES,
  VERIFIER_PLAINTEXT,
  base64ToBytes,
  bytesToBase64,
} from './vault';
import type { EncryptedRecord, VaultDescriptor } from './vault';

/** Инъектируемый источник N случайных байт (детерминированный в тестах). */
export type ByteSource = (n: number) => Uint8Array;

/** Дефолтный криптостойкий источник: `crypto.getRandomValues`. */
export const cryptoBytes: ByteSource = (n: number): Uint8Array => {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
};

/**
 * Генерирует свежую соль длиной `SALT_BYTES`.
 *
 * @param bytes Источник байт (для тестов); по умолчанию crypto.
 * @returns Соль (`SALT_BYTES` байт).
 */
export function newSalt(bytes: ByteSource = cryptoBytes): Uint8Array {
  return bytes(SALT_BYTES);
}

/** Параметры деривации ключа (соль в base64, как хранится в дескрипторе). */
export interface KdfParams {
  /** base64. */
  readonly salt: string;
  readonly iterations: number;
  /** Храним в нижнем регистре; к Web Crypto маппится как 'SHA-256'. */
  readonly hash: 'sha-256';
}

/**
 * Деривирует НЕэкспортируемый ключ AES-GCM-256 из пароля через PBKDF2.
 * `extractable: false` — сырой ключ нельзя вытащить из CryptoKey (защита от утечки
 * даже при компрометации JS-контекста); usages ограничены encrypt/decrypt.
 *
 * @param password Пароль пользователя (UTF-8).
 * @param params Параметры KDF (соль/итерации/хеш).
 * @returns Непэкспортируемый CryptoKey AES-GCM-256.
 * @throws Error если соль — некорректный base64 (программная ошибка вызывающего).
 */
export async function deriveKey(password: string, params: KdfParams): Promise<CryptoKey> {
  const saltBytes = base64ToBytes(params.salt);
  if (saltBytes === null) {
    throw new Error('deriveKey: соль — некорректный base64');
  }
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  // Единственный поддерживаемый хеш — SHA-256 (см. тип KdfParams.hash).
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: params.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Шифрует UTF-8 текст. Свежий 12-байтный IV берётся из `bytes` (по умолчанию crypto)
 * на КАЖДЫЙ вызов — переиспользование (IV, ключ) в GCM катастрофично, поэтому IV
 * никогда не фиксируется в проде.
 *
 * @param key Ключ AES-GCM.
 * @param plaintext Открытый текст (UTF-8).
 * @param bytes Источник байт для IV (для тестов); по умолчанию crypto.
 * @returns Запись с iv/ciphertext в base64 и `schemaVersion`.
 */
export async function seal(
  key: CryptoKey,
  plaintext: string,
  bytes: ByteSource = cryptoBytes,
): Promise<EncryptedRecord> {
  const iv = bytes(IV_BYTES);
  const data = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(buf)),
    schemaVersion: RECORD_SCHEMA_VERSION,
  };
}

/** Результат расшифровки: открытый текст либо типизированная ошибка. */
export type OpenResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: 'decrypt-failed' | 'invalid-record' };

/**
 * Расшифровывает запись. Повреждённый base64 iv/ciphertext ⇒ `invalid-record`;
 * провал GCM-тега (подделка/неверный ключ) ⇒ `decrypt-failed`. Никогда не бросает.
 *
 * @param key Ключ AES-GCM.
 * @param record Зашифрованная запись.
 * @returns Результат расшифровки.
 */
export async function open(key: CryptoKey, record: EncryptedRecord): Promise<OpenResult> {
  const iv = base64ToBytes(record.iv);
  const ciphertext = base64ToBytes(record.ciphertext);
  if (iv === null || ciphertext === null) {
    return { ok: false, error: 'invalid-record' };
  }
  try {
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return { ok: true, value: new TextDecoder().decode(buf) };
  } catch {
    return { ok: false, error: 'decrypt-failed' };
  }
}

/**
 * Шифрует канарейку `VERIFIER_PLAINTEXT` — запись кладётся в дескриптор хранилища
 * как контрол пароля.
 *
 * @param key Ключ AES-GCM.
 * @param bytes Источник байт для IV (для тестов); по умолчанию crypto.
 * @returns Зашифрованная канарейка.
 */
export function makeVerifier(
  key: CryptoKey,
  bytes: ByteSource = cryptoBytes,
): Promise<EncryptedRecord> {
  return seal(key, VERIFIER_PLAINTEXT, bytes);
}

/**
 * Проверяет пароль: расшифровывает канарейку дескриптора и сверяет с
 * `VERIFIER_PLAINTEXT`. Неверный пароль (провал GCM-тега) ⇒ `false`, не бросок.
 *
 * @param key Ключ, деривированный из проверяемого пароля.
 * @param descriptor Дескриптор хранилища с зашифрованной канарейкой.
 * @returns `true`, если пароль верный.
 */
export async function verifyPassword(
  key: CryptoKey,
  descriptor: VaultDescriptor,
): Promise<boolean> {
  const result = await open(key, descriptor.verifier);
  return result.ok && result.value === VERIFIER_PLAINTEXT;
}

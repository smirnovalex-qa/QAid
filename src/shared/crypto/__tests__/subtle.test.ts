/**
 * Тесты seam над Web Crypto. Среда даёт реальный `crypto.subtle` (Node webcrypto,
 * см. tests/setup), поэтому движок НЕ мокается. Недетерминированность убрана через
 * инъектируемый `ByteSource`, а итерации PBKDF2 в тестах малы (скорость) — это не
 * ослабляет проверяемую логику.
 */
import { describe, expect, it } from 'vitest';
import {
  cryptoBytes,
  deriveKey,
  makeVerifier,
  newSalt,
  open,
  seal,
  verifyPassword,
} from '../subtle';
import type { ByteSource, KdfParams } from '../subtle';
import {
  IV_BYTES,
  RECORD_SCHEMA_VERSION,
  SALT_BYTES,
  base64ToBytes,
  bytesToBase64,
} from '../vault';
import type { VaultDescriptor } from '../vault';

/** Счётчик-источник: каждый вызов продолжает последовательность (IV будут разными). */
function counterSource(): ByteSource {
  let c = 0;
  return (n: number): Uint8Array => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = c++ & 0xff;
    return out;
  };
}

/** Фиксированный источник: один и тот же паттерн на каждый вызов (воспроизводимость). */
function fixedSource(seed: number): ByteSource {
  return (n: number): Uint8Array => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (seed + i) & 0xff;
    return out;
  };
}

const TEST_SALT = bytesToBase64(new Uint8Array(SALT_BYTES).fill(42));

function testParams(overrides: Partial<KdfParams> = {}): KdfParams {
  return { salt: TEST_SALT, iterations: 1000, hash: 'sha-256', ...overrides };
}

describe('deriveKey', () => {
  it('returns a non-extractable AES-GCM key usable for encrypt/decrypt', async () => {
    const key = await deriveKey('pw', testParams());
    expect(key.extractable).toBe(false);
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('rejects when the salt is malformed base64', async () => {
    await expect(deriveKey('pw', testParams({ salt: 'not-valid!' }))).rejects.toThrow();
  });
});

describe('seal / open round-trip', () => {
  it('round-trips ASCII plaintext', async () => {
    const key = await deriveKey('pw', testParams());
    const record = await seal(key, 'hello');
    expect(record.schemaVersion).toBe(RECORD_SCHEMA_VERSION);
    const opened = await open(key, record);
    expect(opened).toEqual({ ok: true, value: 'hello' });
  });

  it('round-trips unicode plaintext', async () => {
    const key = await deriveKey('pw', testParams());
    const text = 'Привет 🔐 мир — тест';
    const opened = await open(key, await seal(key, text));
    expect(opened).toEqual({ ok: true, value: text });
  });
});

describe('IV handling', () => {
  it('uses a fresh IV per record: counter source yields different iv AND ciphertext', async () => {
    const key = await deriveKey('pw', testParams());
    const src = counterSource();
    const a = await seal(key, 'same', src);
    const b = await seal(key, 'same', src);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // IV ровно IV_BYTES байт.
    expect(base64ToBytes(a.iv)?.length).toBe(IV_BYTES);
  });

  it('is reproducible when the injected byte source is fixed', async () => {
    const key = await deriveKey('pw', testParams());
    const a = await seal(key, 'same', fixedSource(7));
    const b = await seal(key, 'same', fixedSource(7));
    expect(a.iv).toBe(b.iv);
    expect(a.ciphertext).toBe(b.ciphertext);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects the wrong one (no throw)', async () => {
    const keyRight = await deriveKey('right', testParams());
    const keyWrong = await deriveKey('wrong', testParams());
    const verifier = await makeVerifier(keyRight); // дефолтный crypto-источник IV
    const descriptor: VaultDescriptor = {
      kdf: 'pbkdf2',
      hash: 'sha-256',
      iterations: 1000,
      salt: TEST_SALT,
      schemaVersion: 1,
      verifier,
    };
    expect(await verifyPassword(keyRight, descriptor)).toBe(true);
    expect(await verifyPassword(keyWrong, descriptor)).toBe(false);
  });
});

describe('open failure modes', () => {
  it('returns decrypt-failed when the ciphertext is tampered', async () => {
    const key = await deriveKey('pw', testParams());
    const record = await seal(key, 'secret');
    const ct = base64ToBytes(record.ciphertext);
    expect(ct).not.toBeNull();
    const mutated = ct ?? new Uint8Array();
    mutated[0] = (mutated[0] ?? 0) ^ 0xff; // переворачиваем один байт → GCM-тег не сойдётся
    const tampered = { ...record, ciphertext: bytesToBase64(mutated) };
    expect(await open(key, tampered)).toEqual({ ok: false, error: 'decrypt-failed' });
  });

  it('returns invalid-record when the iv is malformed base64', async () => {
    const key = await deriveKey('pw', testParams());
    const record = await seal(key, 'secret');
    expect(await open(key, { ...record, iv: 'bad!' })).toEqual({
      ok: false,
      error: 'invalid-record',
    });
  });

  it('returns invalid-record when the ciphertext is malformed base64', async () => {
    const key = await deriveKey('pw', testParams());
    const record = await seal(key, 'secret');
    expect(await open(key, { ...record, ciphertext: 'bad!' })).toEqual({
      ok: false,
      error: 'invalid-record',
    });
  });
});

describe('newSalt / cryptoBytes', () => {
  it('returns SALT_BYTES length and uses the injected bytes', () => {
    const salt = newSalt(fixedSource(5));
    expect(salt.length).toBe(SALT_BYTES);
    expect(Array.from(salt)).toEqual(Array.from(fixedSource(5)(SALT_BYTES)));
  });

  it('defaults to the crypto byte source with the right length', () => {
    expect(newSalt().length).toBe(SALT_BYTES);
    expect(cryptoBytes(IV_BYTES).length).toBe(IV_BYTES);
  });

  it('seal falls back to the default crypto IV source', async () => {
    const key = await deriveKey('pw', testParams());
    const record = await seal(key, 'via-default-iv');
    expect(await open(key, record)).toEqual({ ok: true, value: 'via-default-iv' });
  });
});

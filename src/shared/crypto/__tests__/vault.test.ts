/**
 * Тесты чистого ядра хранилища: round-trip base64 (включая границы паддинга),
 * строгость декодера, политика перешифровки и парсеры недоверенного ввода
 * (форма → версия, никогда не бросают).
 */
import { describe, expect, it } from 'vitest';
import {
  IV_BYTES,
  PBKDF2_ITERATIONS,
  RECORD_SCHEMA_VERSION,
  SALT_BYTES,
  VAULT_SCHEMA_VERSION,
  base64ToBytes,
  bytesToBase64,
  needsRekey,
  parseEncryptedRecord,
  parseVaultDescriptor,
} from '../vault';
import type { EncryptedRecord, VaultDescriptor } from '../vault';

function validRecord(): EncryptedRecord {
  return {
    iv: bytesToBase64(new Uint8Array(IV_BYTES).fill(1)),
    ciphertext: bytesToBase64(new Uint8Array(32).fill(2)),
    schemaVersion: RECORD_SCHEMA_VERSION,
  };
}

function validDescriptor(): VaultDescriptor {
  return {
    kdf: 'pbkdf2',
    hash: 'sha-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(new Uint8Array(SALT_BYTES).fill(9)),
    schemaVersion: VAULT_SCHEMA_VERSION,
    verifier: validRecord(),
  };
}

describe('base64 codecs', () => {
  it('round-trips the empty array and padding boundaries (len 1,2,3)', () => {
    for (let len = 0; len <= 3; len++) {
      const input = new Uint8Array(len);
      for (let i = 0; i < len; i++) input[i] = (i * 37 + 11) & 0xff;
      const decoded = base64ToBytes(bytesToBase64(input));
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded ?? new Uint8Array())).toEqual(Array.from(input));
    }
  });

  it('round-trips a larger buffer covering all byte values', () => {
    const input = new Uint8Array(256);
    for (let i = 0; i < 256; i++) input[i] = i;
    const decoded = base64ToBytes(bytesToBase64(input));
    expect(Array.from(decoded ?? new Uint8Array())).toEqual(Array.from(input));
  });

  it('produces correct padding for known vectors', () => {
    expect(bytesToBase64(new Uint8Array([0]))).toBe('AA==');
    expect(bytesToBase64(new Uint8Array([0, 0]))).toBe('AAA=');
    expect(bytesToBase64(new Uint8Array([0, 0, 0]))).toBe('AAAA');
  });

  it('base64ToBytes returns null on malformed input', () => {
    expect(base64ToBytes('abc')).toBeNull(); // длина не кратна 4
    expect(base64ToBytes('!!!!')).toBeNull(); // символы не из алфавита
    expect(base64ToBytes('====')).toBeNull(); // паддинг на позициях 0/1
    expect(base64ToBytes('A===')).toBeNull(); // паддинг на позиции 1
    expect(base64ToBytes('AB=A')).toBeNull(); // `=` на поз.2 без `=` на поз.3
    expect(base64ToBytes('AA==AAAA')).toBeNull(); // `=` в НЕпоследней группе
    expect(base64ToBytes('AAA=AAAA')).toBeNull(); // `=` поз.3 в непоследней группе
    expect(base64ToBytes('AAAA!AAA')).toBeNull(); // битый символ во 2-й группе
  });

  it('decodes a multi-group string with a single trailing pad', () => {
    // 8 символов, последняя группа 'AAA=' (один паддинг) → 5 байт; покрывает
    // ветку «паддинг только в последней группе» при наличии предыдущей группы.
    const decoded = base64ToBytes('AAAAAAA=');
    expect(decoded).not.toBeNull();
    expect(decoded?.length).toBe(5);
  });
});

describe('needsRekey', () => {
  it('is false for a current-default descriptor', () => {
    expect(needsRekey(validDescriptor())).toBe(false);
  });

  it('is true when iterations are below the current default', () => {
    expect(needsRekey({ ...validDescriptor(), iterations: PBKDF2_ITERATIONS - 1 })).toBe(true);
  });

  it('is true when the schema version is older', () => {
    expect(needsRekey({ ...validDescriptor(), schemaVersion: VAULT_SCHEMA_VERSION - 1 })).toBe(
      true,
    );
  });

  it('is true when kdf does not match', () => {
    const d = { ...validDescriptor(), kdf: 'scrypt' } as unknown as VaultDescriptor;
    expect(needsRekey(d)).toBe(true);
  });

  it('is true when hash does not match', () => {
    const d = { ...validDescriptor(), hash: 'sha-512' } as unknown as VaultDescriptor;
    expect(needsRekey(d)).toBe(true);
  });
});

describe('parseVaultDescriptor', () => {
  it('returns ok on a valid descriptor', () => {
    const result = parseVaultDescriptor(validDescriptor());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kdf).toBe('pbkdf2');
  });

  it('returns invalid-shape on garbage and primitives (never throws)', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, true]) {
      const result = parseVaultDescriptor(bad);
      expect(result).toEqual({ ok: false, error: 'invalid-shape' });
    }
  });

  it('returns invalid-shape on missing fields', () => {
    const withoutSalt: Record<string, unknown> = { ...validDescriptor() };
    delete withoutSalt.salt;
    expect(parseVaultDescriptor(withoutSalt)).toEqual({ ok: false, error: 'invalid-shape' });
  });

  it('returns invalid-shape on wrong field types', () => {
    expect(parseVaultDescriptor({ ...validDescriptor(), iterations: 'lots' })).toEqual({
      ok: false,
      error: 'invalid-shape',
    });
  });

  it('returns invalid-shape when the nested verifier is malformed', () => {
    expect(parseVaultDescriptor({ ...validDescriptor(), verifier: { iv: 1 } })).toEqual({
      ok: false,
      error: 'invalid-shape',
    });
  });

  it('returns unsupported-version when schemaVersion exceeds current', () => {
    expect(
      parseVaultDescriptor({ ...validDescriptor(), schemaVersion: VAULT_SCHEMA_VERSION + 1 }),
    ).toEqual({ ok: false, error: 'unsupported-version' });
  });
});

describe('parseEncryptedRecord', () => {
  it('returns ok on a valid record', () => {
    const result = parseEncryptedRecord(validRecord());
    expect(result.ok).toBe(true);
  });

  it('returns invalid-shape on garbage (never throws)', () => {
    for (const bad of [null, 0, 'nope', [], {}]) {
      expect(parseEncryptedRecord(bad)).toEqual({ ok: false, error: 'invalid-shape' });
    }
  });

  it('returns unsupported-version when schemaVersion exceeds current', () => {
    expect(
      parseEncryptedRecord({ ...validRecord(), schemaVersion: RECORD_SCHEMA_VERSION + 1 }),
    ).toEqual({ ok: false, error: 'unsupported-version' });
  });
});

describe('constants sanity', () => {
  it('meets the enterprise crypto bar', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(SALT_BYTES).toBeGreaterThanOrEqual(16);
    expect(IV_BYTES).toBe(12);
  });
});

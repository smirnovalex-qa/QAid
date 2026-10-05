import { describe, expect, it } from 'vitest';
import { cardNumber, iban, isUuidV4, isValidIban, isValidLuhn, uuidV4 } from '../smart';
import type { CardScheme, IbanCountry } from '../types';
import { recording, seeded } from './support';

// ───────────────────────────── карта (Луна) ─────────────────────────────

const CARD_LENGTHS: Record<CardScheme, number> = { visa: 16, mastercard: 16, amex: 15 };
const CARD_PREFIX: Record<CardScheme, RegExp> = {
  visa: /^4/,
  mastercard: /^5[1-5]/,
  amex: /^3[47]/,
};

describe('cardNumber — valid Luhn', () => {
  for (const scheme of ['visa', 'mastercard', 'amex'] as const) {
    it(`${scheme}: correct length, prefix and Luhn checksum`, () => {
      for (let i = 0; i < 300; i += 1) {
        const n = cardNumber(scheme, seeded(i));
        expect(n).toHaveLength(CARD_LENGTHS[scheme]);
        expect(n).toMatch(CARD_PREFIX[scheme]);
        expect(/^\d+$/.test(n)).toBe(true);
        expect(isValidLuhn(n)).toBe(true);
      }
    });
  }

  it('defaults to visa', () => {
    expect(cardNumber(undefined, seeded(1))).toMatch(/^4/);
  });

  it('is deterministic for a fixed source', () => {
    expect(cardNumber('visa', seeded(5))).toBe(cardNumber('visa', seeded(5)));
  });

  it('isValidLuhn rejects non-digits and tampered numbers', () => {
    expect(isValidLuhn('4111abc')).toBe(false);
    const good = cardNumber('visa', seeded(2));
    const lastDigit = Number(good[good.length - 1]);
    const tampered = good.slice(0, -1) + String((lastDigit + 1) % 10);
    expect(isValidLuhn(tampered)).toBe(false);
  });

  it('draws digits and prefix via below (no modulo-bias)', () => {
    const src = recording([0]);
    cardNumber('mastercard', src);
    // Первый below — выбор префикса (5 вариантов), далее — цифры (основание 10).
    expect(src.ns[0]).toBe(5);
    expect(src.ns.slice(1).every((n) => n === 10)).toBe(true);
  });
});

// ───────────────────────────── IBAN (mod-97) ─────────────────────────────

const IBAN_LENGTHS: Record<IbanCountry, number> = { DE: 22, ES: 24, FR: 27, GB: 22, NL: 18 };

describe('iban — valid mod-97', () => {
  for (const country of ['DE', 'ES', 'FR', 'GB', 'NL'] as const) {
    it(`${country}: correct length, country prefix and mod-97 === 1`, () => {
      for (let i = 0; i < 300; i += 1) {
        const value = iban(country, seeded(i * 3 + 1));
        expect(value).toHaveLength(IBAN_LENGTHS[country]);
        expect(value.slice(0, 2)).toBe(country);
        expect(/^\d{2}$/.test(value.slice(2, 4))).toBe(true);
        expect(isValidIban(value)).toBe(true);
      }
    });
  }

  it('defaults to DE', () => {
    expect(iban(undefined, seeded(1)).slice(0, 2)).toBe('DE');
  });

  it('is deterministic for a fixed source', () => {
    expect(iban('GB', seeded(9))).toBe(iban('GB', seeded(9)));
  });

  it('isValidIban rejects too-short and tampered IBANs', () => {
    expect(isValidIban('DE00')).toBe(false);
    const good = iban('DE', seeded(4));
    const tampered = `${good.slice(0, -1)}${good.endsWith('0') ? '1' : '0'}`;
    expect(isValidIban(tampered)).toBe(false);
  });
});

// ───────────────────────────── UUID v4 (RFC-4122) ─────────────────────────────

describe('uuidV4 — RFC-4122', () => {
  it('produces valid, unique v4 UUIDs with correct version & variant', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      const u = uuidV4(seeded(i));
      expect(isUuidV4(u)).toBe(true);
      expect(u[14]).toBe('4'); // версия
      expect('89ab').toContain(u[19]); // вариант
      expect(seen.has(u)).toBe(false);
      seen.add(u);
    }
  });

  it('uses the crypto secureRandom source by default', () => {
    expect(isUuidV4(uuidV4())).toBe(true);
  });

  it('forces version/variant bits even when entropy is all zeros', () => {
    const u = uuidV4(recording([0]));
    expect(isUuidV4(u)).toBe(true);
    expect(u[14]).toBe('4');
    expect(u[19]).toBe('8'); // 0x00 & 0x3f | 0x80 → 0x80 → старший nibble '8'
  });

  it('is deterministic for a fixed source', () => {
    expect(uuidV4(seeded(123))).toBe(uuidV4(seeded(123)));
  });

  it('draws 16 bytes via below(256) — no modulo-bias', () => {
    const src = recording([0]);
    uuidV4(src);
    expect(src.ns).toHaveLength(16);
    expect(src.ns.every((n) => n === 256)).toBe(true);
  });

  it('isUuidV4 rejects malformed strings', () => {
    expect(isUuidV4('')).toBe(false);
    expect(isUuidV4('not-a-uuid')).toBe(false);
    expect(isUuidV4('c232ab00-9414-11ec-b3c8-9e6bdeced846')).toBe(false); // v1
    expect(isUuidV4('00000000-0000-4000-c000-000000000000')).toBe(false); // bad variant
    expect(isUuidV4('9f8e7d6c-5b4a-4c3d-8e2f-1a2b3c4d5e6f')).toBe(true);
  });
});

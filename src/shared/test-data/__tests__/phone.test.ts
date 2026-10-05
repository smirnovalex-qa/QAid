import { describe, expect, it } from 'vitest';
import { phone } from '../phone';
import { PHONE_FORMATS } from '../data/phone-formats';
import type { PhoneCountry } from '../types';
import { recording, seeded } from './support';

const COUNTRIES: PhoneCountry[] = ['US', 'RU', 'GB', 'DE', 'FR'];

/** Заменяет `#` на `\d` — эталонный regex формата страны. */
function formatRe(format: string): RegExp {
  const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '\\d');
  return new RegExp(`^${escaped}$`);
}

describe('phone', () => {
  for (const country of COUNTRIES) {
    it(`renders ${country} in its curated format`, () => {
      const value = phone(country, seeded(country.length + 3));
      expect(value).toMatch(formatRe(PHONE_FORMATS[country]));
      // Столько же цифр, сколько плейсхолдеров `#` в шаблоне.
      const hashes = (PHONE_FORMATS[country].match(/#/g) ?? []).length;
      const digitsInValue = (value.match(/\d/g) ?? []).length;
      const literalDigits = (PHONE_FORMATS[country].match(/\d/g) ?? []).length;
      expect(digitsInValue).toBe(hashes + literalDigits);
    });
  }

  it('defaults to US', () => {
    expect(phone(undefined, seeded(1))).toMatch(formatRe(PHONE_FORMATS.US));
  });

  it('is deterministic for a fixed source', () => {
    expect(phone('RU', seeded(8))).toBe(phone('RU', seeded(8)));
  });

  it('draws each digit via below(10) — no modulo-bias', () => {
    const src = recording([0]);
    phone('US', src);
    // Каждый вызов below запрашивал ровно основание 10 (десятичная цифра).
    expect(src.ns.every((n) => n === 10)).toBe(true);
    expect(src.ns.length).toBe((PHONE_FORMATS.US.match(/#/g) ?? []).length);
  });
});

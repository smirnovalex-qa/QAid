import { describe, expect, it } from 'vitest';
import { address, email, firstName, fullName, lastName } from '../identity';
import { FIRST_NAMES, LAST_NAMES } from '../data/names';
import { recording, seeded } from './support';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('email', () => {
  it('produces an address matching the basic email shape', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(email(seeded(i))).toMatch(EMAIL_RE);
    }
  });

  it('is deterministic for a fixed source', () => {
    expect(email(seeded(42))).toBe(email(seeded(42)));
  });
});

describe('firstName / lastName / fullName', () => {
  it('draws names from the curated locale tables', () => {
    for (const locale of ['en', 'ru'] as const) {
      const f = firstName(locale, seeded(1));
      const l = lastName(locale, seeded(2));
      expect(FIRST_NAMES[locale]).toContain(f);
      expect(LAST_NAMES[locale]).toContain(l);
    }
  });

  it('fullName joins first and last with a single space', () => {
    const name = fullName('en', seeded(7));
    const parts = name.split(' ');
    expect(parts).toHaveLength(2);
    expect(FIRST_NAMES.en).toContain(parts[0]);
    expect(LAST_NAMES.en).toContain(parts[1]);
  });

  it('defaults to the en locale', () => {
    expect(FIRST_NAMES.en).toContain(firstName(undefined, seeded(3)));
  });

  it('is deterministic for a fixed source', () => {
    expect(fullName('ru', seeded(99))).toBe(fullName('ru', seeded(99)));
  });
});

describe('address', () => {
  it('renders an en address with house number, street and city', () => {
    const a = address('en', seeded(5));
    expect(a).toMatch(/^\d+ .+ St, .+$/);
  });

  it('renders a ru address with the ru template', () => {
    const a = address('ru', seeded(5));
    expect(a).toMatch(/^г\. .+, ул\. .+, д\. \d+$/);
  });

  it('is deterministic for a fixed source', () => {
    expect(address('en', seeded(11))).toBe(address('en', seeded(11)));
  });
});

describe('modulo-bias-free selection', () => {
  it('picks names via below(tableLength), not % over a raw word', () => {
    const src = recording([0]);
    firstName('en', src);
    // Первый below — выбор имени из таблицы длины FIRST_NAMES.en.
    expect(src.ns[0]).toBe(FIRST_NAMES.en.length);
  });

  it('every table index is reachable (uniform selection)', () => {
    const seen = new Set<string>();
    const len = FIRST_NAMES.en.length;
    for (let idx = 0; idx < len; idx += 1) {
      // Источник возвращает ровно idx для below(len) → доказывает index === below(len).
      seen.add(firstName('en', recording([idx])));
    }
    expect(seen.size).toBe(len);
  });
});

import { describe, expect, it } from 'vitest';
import type { RandomSource } from '@/shared/random';
import {
  applyCase,
  batch,
  buildAlphabet,
  randomLengthInRange,
  randomString,
  toGraphemes,
  validateParams,
} from '@/features/random-strings/logic';
import type { AlphabetOptions, RandomStringsParams } from '@/features/random-strings/logic';
import { DIGITS, EMOJI, LATIN_LOWER, LATIN_UPPER } from '@/features/random-strings/charsets';

const NO_CHARSETS: AlphabetOptions = {
  latinLower: false,
  latinUpper: false,
  cyrillicLower: false,
  cyrillicUpper: false,
  digits: false,
  special: false,
  emoji: false,
  custom: '',
};

/** Детерминированный источник: `below` циклически отдаёт 0..n-1 (для проверки равномерности). */
function cyclingSource(): RandomSource {
  let c = 0;
  return {
    below: (n) => {
      const v = c % n;
      c += 1;
      return v;
    },
    float: () => 0.5,
  };
}

/** Источник, всегда отдающий фиксированный индекс/долю. */
function fixedSource(index: number): RandomSource {
  return { below: () => index, float: () => 0 };
}

function baseParams(over: Partial<RandomStringsParams> = {}): RandomStringsParams {
  return {
    alphabet: { ...NO_CHARSETS, latinLower: true },
    lengthFrom: 5,
    lengthTo: 5,
    prefix: '',
    suffix: '',
    caseTransform: 'none',
    count: 3,
    ...over,
  };
}

describe('buildAlphabet', () => {
  it('unions enabled charsets in a stable order', () => {
    const a = buildAlphabet({ ...NO_CHARSETS, latinLower: true, digits: true });
    expect(a).toEqual([...LATIN_LOWER, ...DIGITS]);
  });

  it('is empty when nothing is enabled', () => {
    expect(buildAlphabet(NO_CHARSETS)).toEqual([]);
  });

  it('dedups custom graphemes overlapping a charset, keeping first order', () => {
    const a = buildAlphabet({ ...NO_CHARSETS, digits: true, custom: '0129' });
    // '0','1','2' уже есть из DIGITS; добавится только '9'? Нет — '9' тоже в DIGITS.
    expect(a).toEqual(DIGITS);
  });

  it('adds unique custom graphemes after built-ins', () => {
    const a = buildAlphabet({ ...NO_CHARSETS, digits: true, custom: '0ab' });
    expect(a).toEqual([...DIGITS, 'a', 'b']);
  });

  it('treats a multi-codepoint emoji as a single grapheme', () => {
    const a = buildAlphabet({ ...NO_CHARSETS, custom: '👍👍' });
    expect(a).toEqual(['👍']); // дубликат схлопнут
  });
});

describe('validateParams', () => {
  it('flags an empty alphabet', () => {
    expect(validateParams(baseParams({ alphabet: NO_CHARSETS }))).toContainEqual({
      code: 'empty_alphabet',
    });
  });

  it('flags from > to', () => {
    expect(validateParams(baseParams({ lengthFrom: 10, lengthTo: 5 }))).toContainEqual({
      code: 'length_range',
    });
  });

  it('flags negative or non-integer length', () => {
    expect(validateParams(baseParams({ lengthFrom: -1 }))).toContainEqual({ code: 'length_range' });
    expect(validateParams(baseParams({ lengthTo: 5.5 }))).toContainEqual({ code: 'length_range' });
  });

  it('flags length above MAX_LENGTH', () => {
    expect(validateParams(baseParams({ lengthFrom: 0, lengthTo: 5000 }))).toContainEqual({
      code: 'length_too_big',
    });
  });

  it('flags count out of range', () => {
    expect(validateParams(baseParams({ count: 0 }))).toContainEqual({ code: 'count_range' });
    expect(validateParams(baseParams({ count: 200_000 }))).toContainEqual({ code: 'count_range' });
  });

  it('accepts valid params', () => {
    expect(validateParams(baseParams())).toEqual([]);
  });
});

describe('randomLengthInRange', () => {
  it('returns from when from === to', () => {
    expect(randomLengthInRange(7, 7, fixedSource(0))).toBe(7);
  });

  it('is inclusive of both bounds', () => {
    expect(randomLengthInRange(3, 6, fixedSource(0))).toBe(3); // below → 0
    expect(randomLengthInRange(3, 6, fixedSource(3))).toBe(6); // below → 3 (span 4)
  });
});

describe('randomString', () => {
  it('returns "" for length 0 without touching the alphabet', () => {
    expect(randomString(0, [], fixedSource(0))).toBe('');
  });

  it('throws on an empty alphabet when length > 0', () => {
    expect(() => randomString(1, [], fixedSource(0))).toThrow(RangeError);
  });

  it('produces exactly `length` graphemes', () => {
    const alphabet = [...LATIN_LOWER];
    const s = randomString(12, alphabet, cyclingSource());
    expect(toGraphemes(s)).toHaveLength(12);
  });

  it('keeps emoji whole — no broken surrogate pairs', () => {
    const s = randomString(20, EMOJI, cyclingSource());
    const graphemes = toGraphemes(s);
    expect(graphemes).toHaveLength(20);
    for (const g of graphemes) {
      expect(EMOJI).toContain(g);
    }
    // Ни одного «висячего» суррогата: каждая графема — целый code point.
    expect(Array.from(s).every((cp) => cp.codePointAt(0) !== undefined)).toBe(true);
  });

  it('selects characters uniformly via below() — no modulo bias', () => {
    // Алфавит «неудобной» длины 62; циклический источник обходит все индексы.
    const alphabet = [...LATIN_LOWER, ...LATIN_UPPER, ...DIGITS];
    expect(alphabet).toHaveLength(62);
    const s = randomString(62 * 50, alphabet, cyclingSource());
    const counts = new Map<string, number>();
    for (const g of toGraphemes(s)) counts.set(g, (counts.get(g) ?? 0) + 1);
    const values = [...counts.values()];
    expect(counts.size).toBe(62);
    expect(Math.max(...values)).toBe(Math.min(...values)); // отклонение 0
  });
});

describe('applyCase', () => {
  it('none leaves the string unchanged', () => {
    expect(applyCase('Ab72😀', 'none')).toBe('Ab72😀');
  });

  it('upper/lower are locale-aware for Cyrillic and leave digits/emoji intact', () => {
    expect(applyCase('привет42😀', 'upper')).toBe('ПРИВЕТ42😀');
    expect(applyCase('ПРИВЕТ42😀', 'lower')).toBe('привет42😀');
  });

  it('title capitalizes the first grapheme of each word', () => {
    expect(applyCase('привет мир abc', 'title')).toBe('Привет Мир Abc');
  });
});

describe('batch', () => {
  it('generates `count` strings within the length range', () => {
    const out = batch(baseParams({ lengthFrom: 4, lengthTo: 9, count: 25 }));
    expect(out).toHaveLength(25);
    for (const s of out) {
      const len = toGraphemes(s).length;
      expect(len).toBeGreaterThanOrEqual(4);
      expect(len).toBeLessThanOrEqual(9);
    }
  });

  it('applies prefix/suffix AFTER case (literal affixes are not transformed)', () => {
    const out = batch(
      baseParams({
        alphabet: { ...NO_CHARSETS, latinLower: true },
        lengthFrom: 3,
        lengthTo: 3,
        prefix: 'ab-',
        suffix: '-YZ',
        caseTransform: 'upper',
        count: 1,
      }),
      fixedSource(0), // тело = 'aaa' → upper 'AAA'
    );
    expect(out[0]).toBe('ab-AAA-YZ'); // префикс/суффикс сохраняют исходный регистр
  });

  it('produces empty bodies for length 0 (affixes still applied)', () => {
    const out = batch(
      baseParams({
        lengthFrom: 0,
        lengthTo: 0,
        prefix: 'P',
        suffix: 'S',
        count: 2,
      }),
      fixedSource(0),
    );
    expect(out).toEqual(['PS', 'PS']);
  });
});

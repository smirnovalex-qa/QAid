import { describe, expect, it } from 'vitest';
import {
  randomBelow,
  randomBelowBig,
  randomFloat53,
  randomUint32,
  secureRandom,
} from '@/shared/random';

/** Источник по скрипту (циклится, если исчерпан). */
function scripted(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0;
    i += 1;
    return v;
  };
}

describe('randomUint32', () => {
  it('returns a 32-bit unsigned integer', () => {
    for (let k = 0; k < 50; k += 1) {
      const v = randomUint32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });
});

describe('randomBelow', () => {
  it('maps a word into [0, n) via modulo of accepted value', () => {
    expect(randomBelow(10, scripted([7]))).toBe(7);
    expect(randomBelow(10, scripted([13]))).toBe(3);
  });

  it('rejects values in the biased tail (no modulo-bias)', () => {
    // n=3: 2^32 % 3 === 1 → limit = 2^32 - 1. Слово (2^32-1) отбрасывается.
    const next = scripted([2 ** 32 - 1, 5]);
    expect(randomBelow(3, next)).toBe(5 % 3);
  });

  it('n === 1 is always 0 and never draws', () => {
    let calls = 0;
    expect(
      randomBelow(1, () => {
        calls += 1;
        return 0;
      }),
    ).toBe(0);
    expect(calls).toBe(0);
  });

  it('covers the full range and never exceeds it', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 2000; k += 1) {
      const v = randomBelow(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6); // все значения встретились
  });

  it('throws on invalid n', () => {
    expect(() => randomBelow(0)).toThrow(RangeError);
    expect(() => randomBelow(1.5)).toThrow(RangeError);
    expect(() => randomBelow(2 ** 32 + 1)).toThrow(/randomBelowBig/);
  });
});

describe('randomBelowBig', () => {
  it('produces values within [0, n) for large n', () => {
    const n = 2 ** 40;
    for (let k = 0; k < 500; k += 1) {
      const v = randomBelowBig(n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('rejects the biased tail on 53 bits', () => {
    // Первое 53-битное значение = 2^53-1 (в хвосте для n=3), затем принимаем.
    const hiAll = 2 ** 32 - 1;
    const loAll = 2 ** 32 - 1;
    const next = scripted([hiAll, loAll, 0, 5]); // 1-е слово-пара → 2^53-1, 2-е → 5
    expect(randomBelowBig(3, next)).toBe(5 % 3);
  });

  it('throws when n exceeds 2^53', () => {
    expect(() => randomBelowBig(2 ** 53 + 2)).toThrow(RangeError);
  });
});

describe('randomFloat53', () => {
  it('returns a value in [0, 1)', () => {
    expect(randomFloat53(scripted([0, 0]))).toBe(0);
    for (let k = 0; k < 200; k += 1) {
      const v = randomFloat53();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('secureRandom', () => {
  it('below stays in range for small and huge n; float in [0,1)', () => {
    expect(secureRandom.below(1)).toBe(0);
    const small = secureRandom.below(5);
    expect(small).toBeGreaterThanOrEqual(0);
    expect(small).toBeLessThan(5);
    const big = secureRandom.below(2 ** 40);
    expect(big).toBeGreaterThanOrEqual(0);
    expect(big).toBeLessThan(2 ** 40);
    expect(secureRandom.float()).toBeLessThan(1);
  });
});

import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@/shared/random';
import { secureRandom } from '@/shared/random';
import {
  validateParams,
  randomInt,
  randomFloat,
  batch,
  formatOutput,
  MAX_COUNT,
  MAX_PRECISION,
} from '../logic';
import type { RandomNumbersParams } from '../types';

/** Идеально равномерный источник: below(n) циклически перебирает остатки 0..n-1. */
function cyclingSource(): RandomSource {
  let counter = 0;
  return {
    below: (n) => counter++ % n,
    float: () => 0,
  };
}

/** Источник с фиксированным float() — для проверки округления/зажатия. */
function fixedFloat(value: number): RandomSource {
  return {
    below: () => 0,
    float: () => value,
  };
}

const validParams: RandomNumbersParams = {
  mode: 'integer',
  min: 0,
  max: 100,
  precision: 2,
  count: 10,
  separator: ', ',
};

describe('randomInt — равномерность (детерминированно)', () => {
  it('below перебирает все значения [0,k] с равной частотой (нет bias, используется below)', () => {
    const src = cyclingSource();
    const k = 9; // span 10 делит 60000 нацело
    const n = 60_000;
    const counts = new Array<number>(k + 1).fill(0);
    for (let i = 0; i < n; i++) {
      const v = randomInt(0, k, src);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const expected = n / (k + 1);
    for (const c of counts) expect(c).toBe(expected);
  });
});

describe('randomInt — границы и диапазон', () => {
  it('инклюзивно: и min, и max появляются, ничего вне [min,max] (secureRandom)', () => {
    const min = 0;
    const max = 9;
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = randomInt(min, max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.has(min)).toBe(true);
    expect(seen.has(max)).toBe(true);
  });

  it('min === max → всегда min', () => {
    for (let i = 0; i < 100; i++) expect(randomInt(7, 7)).toBe(7);
  });

  it('отрицательный диапазон корректен', () => {
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(-50, -10);
      expect(v).toBeGreaterThanOrEqual(-50);
      expect(v).toBeLessThanOrEqual(-10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('большой span (> 2^32) остаётся в диапазоне', () => {
    const min = 0;
    const max = 2 ** 40;
    for (let i = 0; i < 1000; i++) {
      const v = randomInt(min, max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });
});

describe('randomFloat', () => {
  it('уважает precision (не больше precision знаков) и остаётся в [min,max]', () => {
    const precision = 3;
    for (let i = 0; i < 2000; i++) {
      const v = randomFloat(0, 10, precision);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
      const decimals = (v.toString().split('.')[1] ?? '').length;
      expect(decimals).toBeLessThanOrEqual(precision);
    }
  });

  it('округление вверх у края не превышает max (float()≈1 → зажимается к max)', () => {
    const v = randomFloat(0, 0.96, 1, fixedFloat(0.999999999));
    expect(v).toBeLessThanOrEqual(0.96);
    expect(v).toBe(0.96);
  });

  it('min === max → min (float)', () => {
    expect(randomFloat(3.5, 3.5, 2)).toBe(3.5);
  });

  it('precision = 0 не даёт -0', () => {
    const v = randomFloat(-0.4, 0, 0, fixedFloat(0));
    expect(Object.is(v, -0)).toBe(false);
    expect(v).toBe(0);
  });
});

describe('batch', () => {
  it('возвращает count значений в режиме integer', () => {
    const values = batch({ ...validParams, mode: 'integer', min: 1, max: 6, count: 50 });
    expect(values).toHaveLength(50);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('возвращает count значений в режиме float', () => {
    const values = batch({
      ...validParams,
      mode: 'float',
      min: 0,
      max: 1,
      precision: 2,
      count: 30,
    });
    expect(values).toHaveLength(30);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('formatOutput', () => {
  it('склеивает через ", " без хвостового разделителя', () => {
    expect(formatOutput([1, 2, 3], ', ')).toBe('1, 2, 3');
  });

  it('склеивает через перевод строки', () => {
    expect(formatOutput([1, 2, 3], '\n')).toBe('1\n2\n3');
  });

  it('нормализует -0 → 0', () => {
    expect(formatOutput([-0, 1], ', ')).toBe('0, 1');
  });
});

describe('validateParams', () => {
  it('валидные параметры → []', () => {
    expect(validateParams(validParams)).toStrictEqual([]);
  });

  it('min > max → [min_gt_max]', () => {
    expect(validateParams({ ...validParams, min: 10, max: 5 })).toStrictEqual([
      { code: 'min_gt_max' },
    ]);
  });

  it('NaN граница → non_finite с полем', () => {
    expect(validateParams({ ...validParams, min: Number.NaN })).toContainEqual({
      code: 'non_finite',
      field: 'min',
    });
  });

  it('Infinity граница → non_finite с полем', () => {
    expect(validateParams({ ...validParams, max: Number.POSITIVE_INFINITY })).toContainEqual({
      code: 'non_finite',
      field: 'max',
    });
  });

  it('нецелая граница в режиме integer → int_bounds_not_integer', () => {
    expect(validateParams({ ...validParams, mode: 'integer', min: 0.5 })).toContainEqual({
      code: 'int_bounds_not_integer',
      field: 'min',
    });
  });

  it('дробные границы допустимы в режиме float', () => {
    expect(validateParams({ ...validParams, mode: 'float', min: 0.5, max: 1.5 })).toStrictEqual([]);
  });

  it('precision -1 → precision_range', () => {
    expect(validateParams({ ...validParams, precision: -1 })).toContainEqual({
      code: 'precision_range',
    });
  });

  it('precision MAX_PRECISION+1 → precision_range', () => {
    expect(validateParams({ ...validParams, precision: MAX_PRECISION + 1 })).toContainEqual({
      code: 'precision_range',
    });
  });

  it('count 0 → count_range', () => {
    expect(validateParams({ ...validParams, count: 0 })).toContainEqual({ code: 'count_range' });
  });

  it('count MAX_COUNT+1 → count_range', () => {
    expect(validateParams({ ...validParams, count: MAX_COUNT + 1 })).toContainEqual({
      code: 'count_range',
    });
  });

  it('secureRandom доступен как дефолтный источник', () => {
    expect(typeof secureRandom.below).toBe('function');
  });
});

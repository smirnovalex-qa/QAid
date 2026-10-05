import { describe, it, expect } from 'vitest';
import {
  required,
  isFiniteNumber,
  isInteger,
  inRange,
  minLen,
  maxLen,
  compose,
  fieldA11y,
} from '@/shared/validation/validators';

describe('required', () => {
  it('ловит null / undefined / пустую строку', () => {
    expect(required()(null)).toEqual({ code: 'required' });
    expect(required()(undefined)).toEqual({ code: 'required' });
    expect(required()('')).toEqual({ code: 'required' });
  });

  it('пропускает непустое значение', () => {
    expect(required()('x')).toBeNull();
    expect(required<number>()(0)).toBeNull();
  });

  it('прикладывает сообщение только когда оно передано', () => {
    expect(required('Обязательно')('')).toEqual({ code: 'required', message: 'Обязательно' });
  });
});

describe('isFiniteNumber', () => {
  it('пропускает конечное число', () => {
    expect(isFiniteNumber()(42)).toBeNull();
  });

  it('ловит NaN и Infinity', () => {
    expect(isFiniteNumber()(Number.NaN)).toEqual({ code: 'not_finite' });
    expect(isFiniteNumber()(Number.POSITIVE_INFINITY)).toEqual({ code: 'not_finite' });
  });
});

describe('isInteger', () => {
  it('пропускает целое', () => {
    expect(isInteger()(3)).toBeNull();
  });

  it('ловит дробное', () => {
    expect(isInteger('Целое')(3.5)).toEqual({ code: 'not_integer', message: 'Целое' });
  });
});

describe('inRange', () => {
  it('пропускает значение внутри диапазона (включительно)', () => {
    expect(inRange(0, 10)(0)).toBeNull();
    expect(inRange(0, 10)(10)).toBeNull();
  });

  it('ловит выход за границы', () => {
    expect(inRange(0, 10)(-1)).toEqual({ code: 'out_of_range' });
    expect(inRange(0, 10)(11)).toEqual({ code: 'out_of_range' });
  });
});

describe('minLen / maxLen', () => {
  it('minLen ловит короткую строку', () => {
    expect(minLen(3)('ab')).toEqual({ code: 'too_short' });
    expect(minLen(3)('abc')).toBeNull();
  });

  it('maxLen ловит длинную строку', () => {
    expect(maxLen(3)('abcd')).toEqual({ code: 'too_long' });
    expect(maxLen(3)('abc')).toBeNull();
  });
});

describe('compose', () => {
  it('возвращает ВСЕ ошибки в стабильном порядке', () => {
    const v = compose(isFiniteNumber(), isInteger(), inRange(0, 10));
    expect(v(Number.NaN)).toEqual([
      { code: 'not_finite' },
      { code: 'not_integer' },
      { code: 'out_of_range' },
    ]);
  });

  it('возвращает пустой массив, когда всё валидно', () => {
    const v = compose(isFiniteNumber(), isInteger(), inRange(0, 10));
    expect(v(5)).toEqual([]);
  });
});

describe('fieldA11y', () => {
  it('при ошибках: aria-invalid true + aria-describedby, регион role=alert', () => {
    const { input, errorRegion } = fieldA11y('fld', [{ code: 'required' }]);
    expect(input).toEqual({
      id: 'fld',
      'aria-invalid': true,
      'aria-describedby': 'fld-error',
    });
    expect(errorRegion).toEqual({ id: 'fld-error', role: 'alert' });
  });

  it('без ошибок: aria-invalid false, aria-describedby опущен', () => {
    const { input, errorRegion } = fieldA11y('fld', []);
    expect(input).toEqual({ id: 'fld', 'aria-invalid': false });
    expect('aria-describedby' in input).toBe(false);
    expect(errorRegion).toEqual({ id: 'fld-error', role: 'alert' });
  });
});

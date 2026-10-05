import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { decode, encode } from '../codec';

const schema = z.object({ n: z.number(), s: z.string() });
const valid = { n: 1, s: 'ok' };

describe('decode', () => {
  it('ok для валидного объекта', () => {
    const r = decode(valid, schema);
    expect(r).toEqual({ ok: true, value: valid });
  });

  it('missing для undefined', () => {
    expect(decode(undefined, schema)).toEqual({ ok: false, reason: 'missing' });
  });

  it('missing для null', () => {
    expect(decode(null, schema)).toEqual({ ok: false, reason: 'missing' });
  });

  it('schema для объекта, не проходящего схему', () => {
    const r = decode({ n: 'nope' }, schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('schema');
    }
  });

  it('ok для валидного JSON-строкового значения', () => {
    const r = decode(JSON.stringify(valid), schema);
    expect(r).toEqual({ ok: true, value: valid });
  });

  it('json для битой строки', () => {
    const r = decode('{ broken', schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('json');
    }
  });

  it('никогда не бросает на неприятном вводе', () => {
    const nasty = {
      get n(): never {
        throw new Error('boom');
      },
    };
    expect(() => decode(nasty, schema)).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => decode(circular, schema)).not.toThrow();
  });
});

describe('encode', () => {
  it('возвращает провалидированное значение для валидного ввода', () => {
    expect(encode(valid, schema)).toEqual(valid);
  });

  it('бросает для невалидного ввода', () => {
    expect(() => encode({ n: 1 } as never, schema)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { ok, err, isOk, isErr } from '@/shared/result';
import { appError } from '@/shared/errors';

describe('result', () => {
  it('ok wraps a value', () => {
    const r = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
  });

  it('err wraps an error', () => {
    const r = err(appError('INTERNAL', 'boom'));
    expect(r.ok).toBe(false);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('INTERNAL');
  });
});

describe('appError', () => {
  it('omits details when not provided (exactOptionalPropertyTypes)', () => {
    expect(appError('VALIDATION', 'bad')).toEqual({ code: 'VALIDATION', message: 'bad' });
    expect('details' in appError('VALIDATION', 'bad')).toBe(false);
  });

  it('keeps details when provided', () => {
    expect(appError('TIMEOUT', 'slow', { ms: 5000 })).toEqual({
      code: 'TIMEOUT',
      message: 'slow',
      details: { ms: 5000 },
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCookieUrl,
  diffSnapshot,
  parseSnapshot,
  serializeSnapshot,
  tryPrettyJson,
  validateCookieAttrs,
} from '@/shared/inspection/storage/logic';
import type { CookieInput } from '@/shared/inspection/storage/types';
import { cookieA, currentSnapshot, incomingSnapshot } from './fixtures/snapshot';

const validCookie: CookieInput = {
  name: 'a',
  value: 'v',
  domain: 'example.test',
  path: '/',
  secure: true,
  httpOnly: false,
  sameSite: 'lax',
};

describe('serializeSnapshot / parseSnapshot', () => {
  it('round-trips a snapshot through JSON', () => {
    const text = serializeSnapshot(currentSnapshot);
    const parsed = parseSnapshot(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(currentSnapshot);
  });

  it('rejects invalid JSON', () => {
    const parsed = parseSnapshot('{ not json');
    expect(parsed).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('rejects a well-formed JSON with wrong shape', () => {
    const parsed = parseSnapshot(JSON.stringify({ cookies: 'nope' }));
    expect(parsed).toEqual({ ok: false, error: 'invalid-shape' });
  });
});

describe('diffSnapshot', () => {
  it('counts added / changed / removed across areas and cookies', () => {
    const diff = diffSnapshot(currentSnapshot, incomingSnapshot);
    // cookies: cookieB added, cookieA unchanged; current cookieA stays → 0 removed.
    expect(diff.cookies).toEqual({ added: 1, changed: 0, removed: 0 });
    // local: theme changed, flagX added, lang removed (not in incoming).
    expect(diff.local).toEqual({ added: 1, changed: 1, removed: 1 });
    // session: identical → all zero.
    expect(diff.session).toEqual({ added: 0, changed: 0, removed: 0 });
    expect(diff.total).toEqual({ added: 2, changed: 1, removed: 1 });
  });
});

describe('validateCookieAttrs', () => {
  it('accepts a well-formed cookie', () => {
    expect(validateCookieAttrs(validCookie)).toEqual({ valid: true, errors: [] });
    expect(validateCookieAttrs(cookieA).valid).toBe(true);
  });

  it('flags empty name and domain', () => {
    const res = validateCookieAttrs({ ...validCookie, name: ' ', domain: '' });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('name-empty');
    expect(res.errors).toContain('domain-empty');
  });

  it('flags a path without a leading slash', () => {
    expect(validateCookieAttrs({ ...validCookie, path: 'app' }).errors).toContain('path-slash');
  });

  it('flags an invalid SameSite value', () => {
    const res = validateCookieAttrs({
      ...validCookie,
      sameSite: 'bogus' as CookieInput['sameSite'],
    });
    expect(res.errors).toContain('samesite-invalid');
  });

  it('flags a non-positive expiry', () => {
    expect(validateCookieAttrs({ ...validCookie, expirationDate: 0 }).errors).toContain(
      'expires-invalid',
    );
    expect(validateCookieAttrs({ ...validCookie, expirationDate: Number.NaN }).errors).toContain(
      'expires-invalid',
    );
  });

  it('requires Secure for SameSite=None', () => {
    const res = validateCookieAttrs({ ...validCookie, sameSite: 'no_restriction', secure: false });
    expect(res.errors).toContain('samesite-none-insecure');
  });
});

describe('buildCookieUrl', () => {
  it('uses https for secure cookies', () => {
    expect(buildCookieUrl({ secure: true, domain: 'example.test', path: '/' })).toBe(
      'https://example.test/',
    );
  });

  it('uses http for non-secure cookies', () => {
    expect(buildCookieUrl({ secure: false, domain: 'example.test', path: '/app' })).toBe(
      'http://example.test/app',
    );
  });

  it('strips a leading dot from the domain', () => {
    expect(buildCookieUrl({ secure: true, domain: '.example.test', path: '/' })).toBe(
      'https://example.test/',
    );
  });

  it('normalizes a path without a leading slash', () => {
    expect(buildCookieUrl({ secure: false, domain: 'x.test', path: 'a/b' })).toBe(
      'http://x.test/a/b',
    );
  });
});

describe('tryPrettyJson', () => {
  it('pretty-prints a JSON object', () => {
    expect(tryPrettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('pretty-prints a JSON array', () => {
    expect(tryPrettyJson('[1,2]')).toBe('[\n  1,\n  2\n]');
  });

  it('returns the input for non-JSON text', () => {
    expect(tryPrettyJson('hello')).toBe('hello');
  });

  it('returns the input for a bare primitive (not object/array)', () => {
    expect(tryPrettyJson('42')).toBe('42');
    expect(tryPrettyJson('"str"')).toBe('"str"');
  });

  it('returns the input for empty / whitespace', () => {
    expect(tryPrettyJson('')).toBe('');
    expect(tryPrettyJson('   ')).toBe('   ');
  });

  it('returns the input for malformed JSON that looks like an object', () => {
    expect(tryPrettyJson('{ bad')).toBe('{ bad');
  });
});

import { describe, it, expect } from 'vitest';
import {
  bytesToBase64,
  bytesToHex,
  diff,
  fromEpochMs,
  fromIso,
  hashText,
  isUuidV4,
  md5,
  parseUnix,
  uuidV4,
  uuidV4Batch,
  uuidV4FromEntropy,
  MAX_UUID_BATCH,
} from '../logic';
import { MD5_VECTORS, SHA_VECTORS } from './fixtures/hash.vectors';
import { TZ_CASES } from './fixtures/tz.cases';

describe('parseUnix', () => {
  it('parses seconds to epoch ms', () => {
    const r = parseUnix('1609459200', 'seconds');
    expect(r).toEqual({ ok: true, value: 1609459200000 });
  });

  it('passes milliseconds through', () => {
    const r = parseUnix('  1609459200123  ', 'milliseconds');
    expect(r).toEqual({ ok: true, value: 1609459200123 });
  });

  it('accepts negative and fractional seconds', () => {
    expect(parseUnix('-1', 'seconds')).toEqual({ ok: true, value: -1000 });
    expect(parseUnix('1.5', 'seconds')).toEqual({ ok: true, value: 1500 });
  });

  it('rejects empty / non-numeric / infinite input', () => {
    for (const bad of ['', '   ', 'abc', '12abc', 'Infinity', 'NaN']) {
      const r = parseUnix(bad, 'seconds');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('invalid-number');
    }
  });

  it('rejects values beyond the Date range', () => {
    const r = parseUnix('1e16', 'milliseconds');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('range');
  });
});

describe('fromEpochMs / fromIso — timezone & DST', () => {
  for (const c of TZ_CASES) {
    it(`fromIso: ${c.name}`, () => {
      const r = fromIso(c.iso, c.zone);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.offsetMinutes).toBe(c.expectedOffsetMinutes);
      expect(r.value.inZone).toBe(c.expectedInZone);
      expect(r.value.zone).toBe(c.zone);
      expect(r.value.iso).toBe(c.iso);
    });

    it(`fromEpochMs: ${c.name}`, () => {
      const epochMs = Date.parse(c.iso);
      const r = fromEpochMs(epochMs, c.zone);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.epochMs).toBe(epochMs);
      expect(r.value.epochSeconds).toBe(Math.floor(epochMs / 1000));
      expect(r.value.offsetMinutes).toBe(c.expectedOffsetMinutes);
    });
  }

  it('round-trips seconds → epoch → view', () => {
    const parsed = parseUnix('1609459200', 'seconds');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const view = fromEpochMs(parsed.value, 'UTC');
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.iso).toBe('2021-01-01T00:00:00.000Z');
    expect(view.value.epochSeconds).toBe(1609459200);
  });

  it('errors on unknown zone', () => {
    const r = fromEpochMs(0, 'Mars/Phobos');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-zone');
  });

  it('errors on empty zone', () => {
    const r = fromEpochMs(0, '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-zone');
  });

  it('errors on out-of-range epoch', () => {
    const r = fromEpochMs(9e15, 'UTC');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('range');
  });

  it('errors on invalid ISO string', () => {
    const r = fromIso('not-a-date', 'UTC');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-iso');
  });
});

describe('diff', () => {
  it('decomposes a signed positive difference', () => {
    const a = Date.UTC(2021, 0, 1, 0, 0, 0);
    const b = Date.UTC(2021, 0, 3, 3, 4, 5);
    const d = diff(a, b);
    expect(d.ms).toBe(b - a);
    expect(d.absMs).toBe(b - a);
    expect(d).toMatchObject({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(d.humanized).toBe('2d 3h 4m 5s');
  });

  it('reverses sign but keeps magnitude', () => {
    const a = Date.UTC(2021, 0, 3, 3, 4, 5);
    const b = Date.UTC(2021, 0, 1, 0, 0, 0);
    const d = diff(a, b);
    expect(d.ms).toBeLessThan(0);
    expect(d.absMs).toBe(a - b);
    expect(d.humanized).toBe('2d 3h 4m 5s');
  });

  it('handles crossing midnight', () => {
    const a = Date.UTC(2021, 0, 1, 23, 30, 0);
    const b = Date.UTC(2021, 0, 2, 0, 30, 0);
    const d = diff(a, b);
    expect(d).toMatchObject({ days: 0, hours: 1, minutes: 0, seconds: 0 });
  });

  it('is zero for equal moments', () => {
    const d = diff(1000, 1000);
    expect(d).toMatchObject({ ms: 0, absMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(d.humanized).toBe('0d 0h 0m 0s');
  });
});

describe('bytesToHex / bytesToBase64', () => {
  it('encodes hex lowercase, fixed width', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('encodes base64 with padding', () => {
    expect(bytesToBase64(new TextEncoder().encode('abc'))).toBe('YWJj');
    expect(bytesToBase64(new TextEncoder().encode('a'))).toBe('YQ==');
    expect(bytesToBase64(new TextEncoder().encode('ab'))).toBe('YWI=');
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });
});

describe('hashText — SHA known answers', () => {
  for (const v of SHA_VECTORS) {
    it(`${v.algo}("${v.input}")`, async () => {
      const res = await hashText(v.input, v.algo);
      expect(res.algo).toBe(v.algo);
      expect(res.hex).toBe(v.hex);
      // base64 должен соответствовать тем же байтам, что и hex.
      const bytes = new Uint8Array(v.hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
      expect(res.base64).toBe(bytesToBase64(bytes));
      expect(res.hex).toBe(bytesToHex(bytes));
    });
  }
});

describe('md5 — legacy known answers', () => {
  for (const v of MD5_VECTORS) {
    it(`md5("${v.input}")`, () => {
      expect(md5(v.input)).toBe(v.hex);
    });
  }
});

describe('uuidV4 / isUuidV4 / uuidV4Batch', () => {
  it('generates 10000 unique, valid v4 UUIDs with correct version & variant', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const u = uuidV4();
      expect(isUuidV4(u)).toBe(true);
      expect(u[14]).toBe('4'); // версия
      expect('89ab').toContain(u[19]); // вариант
      expect(seen.has(u)).toBe(false);
      seen.add(u);
    }
  });

  it('assembles a valid v4 from raw entropy (fallback path)', () => {
    for (let i = 0; i < 1000; i++) {
      const u = uuidV4FromEntropy();
      expect(isUuidV4(u)).toBe(true);
      expect(u[14]).toBe('4');
      expect('89ab').toContain(u[19]);
    }
  });

  it('rejects malformed UUIDs', () => {
    expect(isUuidV4('')).toBe(false);
    expect(isUuidV4('not-a-uuid')).toBe(false);
    // версия 1
    expect(isUuidV4('c232ab00-9414-11ec-b3c8-9e6bdeced846')).toBe(false);
    // неверный вариант (первый nibble четвёртой группы = c)
    expect(isUuidV4('00000000-0000-4000-c000-000000000000')).toBe(false);
  });

  it('accepts a canonical v4', () => {
    expect(isUuidV4('9f8e7d6c-5b4a-4c3d-8e2f-1a2b3c4d5e6f')).toBe(true);
  });

  it('clamps batch size to [0, MAX_UUID_BATCH]', () => {
    expect(uuidV4Batch(0)).toEqual([]);
    expect(uuidV4Batch(-5)).toEqual([]);
    expect(uuidV4Batch(Number.NaN)).toEqual([]);
    expect(uuidV4Batch(3)).toHaveLength(3);
    expect(uuidV4Batch(MAX_UUID_BATCH + 1000)).toHaveLength(MAX_UUID_BATCH);
    expect(uuidV4Batch(2.9)).toHaveLength(2); // floor
    for (const u of uuidV4Batch(50)) expect(isUuidV4(u)).toBe(true);
  });
});

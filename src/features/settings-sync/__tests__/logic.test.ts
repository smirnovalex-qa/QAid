import { describe, it, expect } from 'vitest';
import {
  checkItemQuota,
  checkQuota,
  estimateItemBytes,
  isEnvelope,
  localChangedSince,
  makeEnvelope,
  mergeLww,
  namespaceIdFromKey,
  parseEnvelope,
  stableEqual,
  stableStringify,
  syncKey,
  SYNC_KEY_PREFIX,
} from '../logic';
import type { EnvelopeMigration, QuotaLimits, SyncEnvelope } from '../types';

const LIMITS: QuotaLimits = { QUOTA_BYTES: 1000, QUOTA_BYTES_PER_ITEM: 100, MAX_ITEMS: 5 };

describe('keys', () => {
  it('builds and parses sync keys', () => {
    expect(syncKey('app')).toBe(`${SYNC_KEY_PREFIX}app`);
    expect(namespaceIdFromKey(syncKey('forms'))).toBe('forms');
    expect(namespaceIdFromKey('other.key')).toBeNull();
  });
});

describe('stableStringify', () => {
  it('is order-independent for object keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it('recurses into nested objects and arrays', () => {
    expect(stableStringify({ x: [{ b: 1, a: 2 }] })).toBe('{"x":[{"a":2,"b":1}]}');
  });

  it('handles primitives and undefined', () => {
    expect(stableStringify(5)).toBe('5');
    expect(stableStringify('s')).toBe('"s"');
    expect(stableStringify(undefined)).toBe('');
  });

  it('stableEqual compares structurally', () => {
    expect(stableEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(stableEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('envelope', () => {
  it('makeEnvelope wraps value with version + updatedAt', () => {
    const env = makeEnvelope({ n: 1 }, 42);
    expect(env).toEqual({ v: 1, updatedAt: 42, value: { n: 1 } });
  });

  it('isEnvelope validates shape', () => {
    expect(isEnvelope({ v: 1, updatedAt: 1, value: 0 })).toBe(true);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope(5)).toBe(false);
    expect(isEnvelope({ updatedAt: 1, value: 0 })).toBe(false);
    expect(isEnvelope({ v: 1, value: 0 })).toBe(false);
    expect(isEnvelope({ v: 1, updatedAt: 1 })).toBe(false);
  });

  it('parseEnvelope returns null for non-objects and non-envelopes', () => {
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope(7)).toBeNull();
    expect(parseEnvelope({ foo: 'bar' })).toBeNull();
  });

  it('parseEnvelope accepts a current-version envelope', () => {
    const raw = { v: 1, updatedAt: 10, value: { a: 1 } };
    expect(parseEnvelope(raw)).toEqual(raw);
  });

  it('parseEnvelope migrates up the chain to current version', () => {
    const migrations: EnvelopeMigration[] = [
      { from: 1, migrate: (prev) => ({ ...prev, v: 2, value: { migrated: true } }) },
    ];
    const raw = { v: 1, updatedAt: 10, value: { a: 1 } };
    const out = parseEnvelope(raw, migrations, 2);
    expect(out).toEqual({ v: 2, updatedAt: 10, value: { migrated: true } });
  });

  it('parseEnvelope returns null when no migration path reaches current version', () => {
    const raw = { v: 1, updatedAt: 10, value: 0 };
    expect(parseEnvelope(raw, [], 2)).toBeNull();
  });
});

describe('mergeLww', () => {
  const local = makeEnvelope('L', 100);
  const remote = makeEnvelope('R', 200);

  it('none when both missing', () => {
    expect(mergeLww(undefined, undefined, 0)).toEqual({ kind: 'none', conflict: false });
  });

  it('pushes local when remote missing (local is source of truth)', () => {
    const res = mergeLww(local, undefined, 50);
    expect(res.kind).toBe('local');
    expect(res.side).toBe('local');
    expect(res.winner).toBe(local);
    expect(res.conflict).toBe(false);
  });

  it('pulls remote when local missing', () => {
    const res = mergeLww(undefined, remote, 0);
    expect(res.kind).toBe('remote');
    expect(res.winner).toBe(remote);
  });

  it('equal when updatedAt matches', () => {
    const res = mergeLww(makeEnvelope('L', 100), makeEnvelope('R', 100), 100);
    expect(res.kind).toBe('equal');
    expect(res.conflict).toBe(false);
  });

  it('remote wins when only remote changed since base', () => {
    // base = local.updatedAt (local unchanged), remote newer.
    const res = mergeLww(makeEnvelope('L', 100), makeEnvelope('R', 200), 100);
    expect(res.kind).toBe('remote');
    expect(res.side).toBe('remote');
    expect(res.conflict).toBe(false);
  });

  it('local wins when only local changed since base', () => {
    // base = remote.updatedAt (remote unchanged), local newer.
    const res = mergeLww(makeEnvelope('L', 300), makeEnvelope('R', 200), 200);
    expect(res.kind).toBe('local');
    expect(res.side).toBe('local');
    expect(res.conflict).toBe(false);
  });

  it('conflict when both changed since base; LWW picks newer (remote)', () => {
    const res = mergeLww(makeEnvelope('L', 150), makeEnvelope('R', 200), 100);
    expect(res.kind).toBe('conflict');
    expect(res.side).toBe('remote');
    expect(res.winner?.value).toBe('R');
    expect(res.conflict).toBe(true);
  });

  it('conflict when both changed since base; LWW picks newer (local)', () => {
    const res = mergeLww(makeEnvelope('L', 250), makeEnvelope('R', 200), 100);
    expect(res.kind).toBe('conflict');
    expect(res.side).toBe('local');
    expect(res.winner?.value).toBe('L');
  });

  it('first-time sync (no base) with both present is a conflict', () => {
    const res = mergeLww(makeEnvelope('L', 150), makeEnvelope('R', 200), 0);
    expect(res.kind).toBe('conflict');
    expect(res.conflict).toBe(true);
  });
});

describe('localChangedSince', () => {
  it('never synced: changed iff a value exists', () => {
    expect(localChangedSince({ a: 1 }, '', 0)).toBe(true);
    expect(localChangedSince(undefined, '', 0)).toBe(false);
  });

  it('detects change by signature against base', () => {
    const sig = stableStringify({ a: 1 });
    expect(localChangedSince({ a: 1 }, sig, 100)).toBe(false);
    expect(localChangedSince({ a: 2 }, sig, 100)).toBe(true);
  });
});

describe('quota', () => {
  it('estimateItemBytes = key length + JSON length', () => {
    expect(estimateItemBytes('k', 1)).toBe('k'.length + '1'.length);
  });

  it('checkItemQuota fits under per-item limit', () => {
    const res = checkItemQuota('k', 'v', LIMITS);
    expect(res.fits).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it('checkItemQuota rejects over per-item limit', () => {
    const big = 'x'.repeat(200);
    const res = checkItemQuota('k', big, LIMITS);
    expect(res.fits).toBe(false);
    expect(res.reason).toBe('item');
  });

  it('checkQuota fits when within all limits', () => {
    const res = checkQuota(
      {
        key: 'k',
        value: 'v',
        existingTotalBytes: 0,
        existingItemBytes: 0,
        itemCount: 0,
        hasKey: false,
      },
      LIMITS,
    );
    expect(res.fits).toBe(true);
  });

  it('checkQuota rejects on per-item first', () => {
    const res = checkQuota(
      {
        key: 'k',
        value: 'x'.repeat(200),
        existingTotalBytes: 0,
        existingItemBytes: 0,
        itemCount: 0,
        hasKey: false,
      },
      LIMITS,
    );
    expect(res.reason).toBe('item');
  });

  it('checkQuota rejects when total would exceed QUOTA_BYTES', () => {
    const res = checkQuota(
      {
        key: 'k',
        value: 'v',
        existingTotalBytes: 999,
        existingItemBytes: 0,
        itemCount: 1,
        hasKey: false,
      },
      LIMITS,
    );
    expect(res.fits).toBe(false);
    expect(res.reason).toBe('total');
  });

  it('checkQuota subtracts existing item bytes when updating a key', () => {
    // existing total 999 but this key already contributes 999 → net stays small.
    const res = checkQuota(
      {
        key: 'k',
        value: 'v',
        existingTotalBytes: 999,
        existingItemBytes: 999,
        itemCount: 1,
        hasKey: true,
      },
      LIMITS,
    );
    expect(res.fits).toBe(true);
  });

  it('checkQuota rejects when adding a new key exceeds MAX_ITEMS', () => {
    const res = checkQuota(
      {
        key: 'k',
        value: 'v',
        existingTotalBytes: 0,
        existingItemBytes: 0,
        itemCount: 5,
        hasKey: false,
      },
      LIMITS,
    );
    expect(res.fits).toBe(false);
    expect(res.reason).toBe('items');
  });

  it('checkQuota allows updating an existing key at MAX_ITEMS', () => {
    const res = checkQuota(
      {
        key: 'k',
        value: 'v',
        existingTotalBytes: 0,
        existingItemBytes: 0,
        itemCount: 5,
        hasKey: true,
      },
      LIMITS,
    );
    expect(res.fits).toBe(true);
  });
});

describe('envelope typing sanity', () => {
  it('SyncEnvelope generic carries value type', () => {
    const env: SyncEnvelope<number> = makeEnvelope(1, 1);
    expect(env.value).toBe(1);
  });
});

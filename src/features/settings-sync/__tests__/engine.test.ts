import { describe, it, expect, vi } from 'vitest';
import { createSettingsSync } from '../engine';
import { makeEnvelope, stableStringify, syncKey } from '../logic';
import { DEFAULT_NAMESPACE_META } from '../types';
import type { NamespaceSyncMeta } from '../types';
import type { SyncableNamespace } from '../ports';
import { createMemoryStore, createMemorySync } from './helpers';

const NS: SyncableNamespace[] = [{ id: 'app', label: 'ss.ns.app' }];
const KEY = syncKey('app');

const meta = (patch: Partial<NamespaceSyncMeta> = {}): NamespaceSyncMeta => ({
  ...DEFAULT_NAMESPACE_META,
  ...patch,
});

describe('createSettingsSync — availability', () => {
  it('reports unavailable and no-ops without a sync seam', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'dark' } });
    const engine = createSettingsSync({ store });
    expect(engine.isAvailable()).toBe(false);
    const { outcome } = await engine.syncOne('app', meta());
    expect(outcome.status).toBe('unavailable');
    await expect(engine.clear('app')).resolves.toBeUndefined();
    const unsubscribe = engine.onRemoteChange(() => undefined);
    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it('lists namespaces from the store', () => {
    const engine = createSettingsSync({ store: createMemoryStore(NS), sync: createMemorySync() });
    expect(engine.namespaces().map((n) => n.id)).toEqual(['app']);
  });
});

describe('createSettingsSync — push/pull', () => {
  it('pushes local when remote is absent', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'dark' } });
    const sync = createMemorySync();
    const engine = createSettingsSync({ store, sync, now: () => 500 });

    const { outcome, meta: next } = await engine.syncOne('app', meta());
    expect(outcome.status).toBe('pushed');
    expect(outcome.conflict).toBe(false);
    expect(sync.store.get(KEY)).toEqual(makeEnvelope({ theme: 'dark' }, 500));
    expect(next.baseUpdatedAt).toBe(500);
    expect(next.baseSig).toBe(stableStringify({ theme: 'dark' }));
  });

  it('pulls remote into the local store when local is absent', async () => {
    const store = createMemoryStore(NS);
    const sync = createMemorySync();
    await sync.set({ [KEY]: makeEnvelope({ theme: 'light' }, 700) });
    const engine = createSettingsSync({ store, sync, now: () => 800 });

    const { outcome, meta: next } = await engine.syncOne('app', meta());
    expect(outcome.status).toBe('pulled');
    expect(store.data.get('app')).toEqual({ theme: 'light' });
    expect(next.baseUpdatedAt).toBe(700);
  });

  it('propagates a change from device A to device B', async () => {
    const sync = createMemorySync(); // общий аккаунт браузера
    const storeA = createMemoryStore(NS, { app: { theme: 'dark' } });
    const storeB = createMemoryStore(NS, { app: { theme: 'dark' } });
    const engineA = createSettingsSync({ store: storeA, sync, now: () => 1000 });
    const engineB = createSettingsSync({ store: storeB, sync, now: () => 900 });

    // Устройство A меняет и пушит.
    await engineA.syncOne('app', meta());
    // Устройство B было согласовано на старом значении (base старее) → тянет A.
    const baseB = meta({ baseUpdatedAt: 10, baseSig: stableStringify({ theme: 'dark' }) });
    const { outcome, meta: nextB } = await engineB.syncOne('app', baseB);
    expect(outcome.status).toBe('pulled');
    expect(storeB.data.get('app')).toEqual({ theme: 'dark' });
    expect(nextB.baseUpdatedAt).toBe(1000);
  });

  it('reports equal on a second sync with no changes', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'dark' } });
    const sync = createMemorySync();
    const engine = createSettingsSync({ store, sync, now: () => 500 });
    const { meta: afterPush } = await engine.syncOne('app', meta());
    const { outcome } = await engine.syncOne('app', afterPush);
    expect(outcome.status).toBe('equal');
    expect(outcome.conflict).toBe(false);
  });
});

describe('createSettingsSync — conflict', () => {
  it('flags a conflict and resolves by LWW (remote newer → pull)', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'localEdit' } });
    const sync = createMemorySync();
    await sync.set({ [KEY]: makeEnvelope({ theme: 'remoteEdit' }, 5000) });
    const engine = createSettingsSync({ store, sync, now: () => 1000 });

    const base = meta({
      selected: true,
      baseUpdatedAt: 100,
      baseSig: stableStringify({ theme: 'original' }),
    });
    const { outcome, meta: next } = await engine.syncOne('app', base);
    expect(outcome.status).toBe('conflict');
    expect(outcome.conflict).toBe(true);
    expect(store.data.get('app')).toEqual({ theme: 'remoteEdit' }); // remote won
    expect(next.conflict).toBe(true);
    expect(next.baseUpdatedAt).toBe(5000);
  });

  it('flags a conflict and resolves by LWW (local newer → push)', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'localEdit' } });
    const sync = createMemorySync();
    await sync.set({ [KEY]: makeEnvelope({ theme: 'remoteEdit' }, 200) });
    const engine = createSettingsSync({ store, sync, now: () => 9000 });

    const base = meta({
      baseUpdatedAt: 100,
      baseSig: stableStringify({ theme: 'original' }),
    });
    const { outcome } = await engine.syncOne('app', base);
    expect(outcome.status).toBe('conflict');
    expect(sync.store.get(KEY)).toEqual(makeEnvelope({ theme: 'localEdit' }, 9000));
  });
});

describe('createSettingsSync — quota', () => {
  it('rejects a namespace that exceeds the per-item quota', async () => {
    const store = createMemoryStore(NS, { app: 'x'.repeat(500) });
    const sync = createMemorySync({ QUOTA_BYTES_PER_ITEM: 20 });
    const engine = createSettingsSync({ store, sync, now: () => 500 });

    const { outcome, meta: next } = await engine.syncOne('app', meta());
    expect(outcome.status).toBe('quota');
    expect(outcome.quota?.reason).toBe('item');
    expect(sync.store.has(KEY)).toBe(false); // не записали
    expect(next.baseUpdatedAt).toBe(0); // мета не тронута
  });

  it('estimate reports fit / non-fit for the current local value', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'dark' } });
    const okSync = createMemorySync();
    const okEngine = createSettingsSync({ store, sync: okSync, now: () => 1 });
    expect((await okEngine.estimate('app')).fits).toBe(true);

    const tightSync = createMemorySync({ QUOTA_BYTES_PER_ITEM: 5 });
    const tightEngine = createSettingsSync({ store, sync: tightSync, now: () => 1 });
    const tight = await tightEngine.estimate('app');
    expect(tight.fits).toBe(false);
    expect(tight.reason).toBe('item');
  });
});

describe('createSettingsSync — remote change + clear', () => {
  it('notifies on sync-prefixed changes only', async () => {
    const sync = createMemorySync();
    const engine = createSettingsSync({ store: createMemoryStore(NS), sync });
    const cb = vi.fn();
    const off = engine.onRemoteChange(cb);

    await sync.set({ [KEY]: makeEnvelope({ a: 1 }, 1) });
    expect(cb).toHaveBeenCalledWith(['app']);

    cb.mockClear();
    await sync.set({ 'unrelated.key': 1 });
    expect(cb).not.toHaveBeenCalled();

    off();
    cb.mockClear();
    await sync.set({ [KEY]: makeEnvelope({ a: 2 }, 2) });
    expect(cb).not.toHaveBeenCalled();
  });

  it('clear removes the namespace item from sync', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'dark' } });
    const sync = createMemorySync();
    const engine = createSettingsSync({ store, sync, now: () => 1 });
    await engine.syncOne('app', meta());
    expect(sync.store.has(KEY)).toBe(true);
    await engine.clear('app');
    expect(sync.store.has(KEY)).toBe(false);
  });
});

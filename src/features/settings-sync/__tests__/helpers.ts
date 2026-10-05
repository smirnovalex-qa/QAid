/**
 * In-memory реализации портов синка для юнит/компонентных тестов (TASK-029).
 * Никакого chrome — чистые Map поверх `NamespaceStore`/`StorageSyncSeam`.
 */
import type {
  NamespaceStore,
  StorageSyncSeam,
  SyncChangeListener,
  SyncableNamespace,
} from '../ports';

export interface MemoryStore extends NamespaceStore {
  data: Map<string, unknown>;
}

/** In-memory `NamespaceStore` над списком пространств. */
export function createMemoryStore(
  namespaces: readonly SyncableNamespace[],
  initial: Record<string, unknown> = {},
): MemoryStore {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    list: (): SyncableNamespace[] => namespaces.map((n) => ({ ...n })),
    read: (id: string): Promise<unknown> => Promise.resolve(data.get(id)),
    write: (id: string, value: unknown): Promise<void> => {
      data.set(id, value);
      return Promise.resolve();
    },
  };
}

export interface MemorySync extends StorageSyncSeam {
  store: Map<string, unknown>;
}

const DEFAULT_LIMITS = {
  QUOTA_BYTES: 102_400,
  QUOTA_BYTES_PER_ITEM: 8_192,
  MAX_ITEMS: 512,
};

interface Change {
  oldValue?: unknown;
  newValue?: unknown;
}

/** In-memory `StorageSyncSeam` с эмуляцией `onChanged` и квот. */
export function createMemorySync(limits: Partial<typeof DEFAULT_LIMITS> = {}): MemorySync {
  const merged = { ...DEFAULT_LIMITS, ...limits };
  const store = new Map<string, unknown>();
  const listeners = new Set<SyncChangeListener>();

  const emit = (changes: Record<string, Change>): void => {
    for (const cb of listeners) cb(changes);
  };

  return {
    store,
    QUOTA_BYTES: merged.QUOTA_BYTES,
    QUOTA_BYTES_PER_ITEM: merged.QUOTA_BYTES_PER_ITEM,
    MAX_ITEMS: merged.MAX_ITEMS,
    get: (keys?: string[] | null): Promise<Record<string, unknown>> => {
      const out: Record<string, unknown> = {};
      const ks = keys ?? [...store.keys()];
      for (const k of ks) {
        if (store.has(k)) out[k] = store.get(k);
      }
      return Promise.resolve(out);
    },
    set: (items: Record<string, unknown>): Promise<void> => {
      const changes: Record<string, Change> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = store.has(k) ? { oldValue: store.get(k), newValue: v } : { newValue: v };
        store.set(k, v);
      }
      emit(changes);
      return Promise.resolve();
    },
    remove: (keys: string[]): Promise<void> => {
      const changes: Record<string, Change> = {};
      for (const k of keys) {
        if (store.has(k)) {
          changes[k] = { oldValue: store.get(k) };
          store.delete(k);
        }
      }
      emit(changes);
      return Promise.resolve();
    },
    getBytesInUse: (keys?: string[] | null): Promise<number> => {
      const ks = keys ?? [...store.keys()];
      let total = 0;
      for (const k of ks) {
        if (store.has(k)) total += k.length + JSON.stringify(store.get(k)).length;
      }
      return Promise.resolve(total);
    },
    onChanged: {
      addListener: (cb: SyncChangeListener): void => {
        listeners.add(cb);
      },
      removeListener: (cb: SyncChangeListener): void => {
        listeners.delete(cb);
      },
    },
  };
}

/**
 * Storage-area — низкоуровневая абстракция над key/value хранилищем.
 *
 * Работает с «сырыми» (`unknown`) значениями: неймспейсинг, кодирование и
 * версионирование живут в слоях выше. Есть две реализации: чистая in-memory
 * (для тестов и не-браузерных сценариев) и адаптер над `browser.storage.local`.
 */
import { browser } from '@/platform';

/** Единичное изменение значения по ключу. */
export interface StorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

/** Абстрактная область хранения «сырых» значений. */
export interface StorageArea {
  getRaw(key: string): Promise<unknown>;
  getManyRaw(keys: string[]): Promise<Record<string, unknown>>;
  setRaw(key: string, value: unknown): Promise<void>;
  removeRaw(key: string): Promise<void>;
  clearAll(): Promise<void>;
  /** Подписка на изменения; возвращает функцию отписки. */
  onChanged(listener: (changes: Record<string, StorageChange>) => void): () => void;
}

/**
 * Создаёт in-memory реализацию {@link StorageArea}.
 *
 * Не зависит от платформы (никакого chrome) — именно её используют все
 * storage-тесты. `seed` клонируется, чтобы внешняя мутация не протекала внутрь.
 * @param seed - начальное содержимое хранилища.
 */
export function createMemoryArea(seed?: Record<string, unknown>): StorageArea {
  const store = new Map<string, unknown>(seed ? Object.entries(seed) : undefined);
  const listeners = new Set<(changes: Record<string, StorageChange>) => void>();

  // Собирает объект изменения, добавляя oldValue только при наличии прежнего значения.
  const makeChange = (
    hadOld: boolean,
    oldValue: unknown,
    hasNew: boolean,
    newValue: unknown,
  ): StorageChange => {
    const change: { oldValue?: unknown; newValue?: unknown } = {};
    if (hadOld) change.oldValue = oldValue;
    if (hasNew) change.newValue = newValue;
    return change;
  };

  const notify = (changes: Record<string, StorageChange>): void => {
    for (const listener of listeners) listener(changes);
  };

  return {
    getRaw(key: string): Promise<unknown> {
      return Promise.resolve(store.get(key));
    },
    getManyRaw(keys: string[]): Promise<Record<string, unknown>> {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (store.has(key)) result[key] = store.get(key);
      }
      return Promise.resolve(result);
    },
    setRaw(key: string, value: unknown): Promise<void> {
      const hadOld = store.has(key);
      const oldValue = store.get(key);
      store.set(key, value);
      notify({ [key]: makeChange(hadOld, oldValue, true, value) });
      return Promise.resolve();
    },
    removeRaw(key: string): Promise<void> {
      if (store.has(key)) {
        const oldValue = store.get(key);
        store.delete(key);
        notify({ [key]: makeChange(true, oldValue, false, undefined) });
      }
      return Promise.resolve();
    },
    clearAll(): Promise<void> {
      if (store.size > 0) {
        const changes: Record<string, StorageChange> = {};
        for (const [key, oldValue] of store) {
          changes[key] = makeChange(true, oldValue, false, undefined);
        }
        store.clear();
        notify(changes);
      }
      return Promise.resolve();
    },
    onChanged(listener: (changes: Record<string, StorageChange>) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/* v8 ignore start */
/**
 * Создаёт адаптер {@link StorageArea} над `browser.storage.local`.
 *
 * Работает с реальным браузером и не покрывается unit-тестами (см. v8 ignore).
 */
export function createChromeLocalArea(): StorageArea {
  return {
    async getRaw(key: string): Promise<unknown> {
      const r = await browser.storage.local.get(key);
      return r[key];
    },
    getManyRaw(keys: string[]): Promise<Record<string, unknown>> {
      return browser.storage.local.get(keys);
    },
    async setRaw(key: string, value: unknown): Promise<void> {
      await browser.storage.local.set({ [key]: value });
    },
    async removeRaw(key: string): Promise<void> {
      await browser.storage.local.remove(key);
    },
    async clearAll(): Promise<void> {
      await browser.storage.local.clear();
    },
    onChanged(listener: (changes: Record<string, StorageChange>) => void): () => void {
      const handler = (
        changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
        areaName: string,
      ): void => {
        if (areaName !== 'local') return;
        const mapped: Record<string, StorageChange> = {};
        for (const [key, raw] of Object.entries(changes)) {
          const change: { oldValue?: unknown; newValue?: unknown } = {};
          if ('oldValue' in raw) change.oldValue = raw.oldValue;
          if ('newValue' in raw) change.newValue = raw.newValue;
          mapped[key] = change;
        }
        listener(mapped);
      };
      browser.storage.onChanged.addListener(handler);
      return () => {
        browser.storage.onChanged.removeListener(handler);
      };
    },
  };
}
/* v8 ignore stop */

// export function createChromeSyncArea(): StorageArea { /* TODO(P2): chrome.storage.sync */ }

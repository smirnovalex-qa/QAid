/**
 * Тесты content-хоста IndexedDB (TASK-031) на `fake-indexeddb` через инъекцию
 * фейкового `indexedDB` в глобал (как задумано в host.ts). Покрывают обход/правку/
 * удаление/очистку и снятие метаданных stores.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { idbHandlers, installIdbContentHost } from '@/shared/inspection/idb/host';

function setIdb(value: unknown): void {
  (globalThis as { indexedDB?: unknown }).indexedDB = value;
}

/** Создаёт базу со stores и данными через upgrade-транзакцию. */
function makeDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
  seed?: (db: IDBDatabase) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = (globalThis as { indexedDB: IDBFactory }).indexedDB.open(name, version);
    req.onupgradeneeded = (): void => {
      upgrade(req.result);
    };
    req.onsuccess = (): void => {
      const db = req.result;
      if (seed === undefined) {
        db.close();
        resolve();
        return;
      }
      seed(db);
      // Дать seed-транзакции завершиться перед закрытием.
      setTimeout(() => {
        db.close();
        resolve();
      }, 0);
    };
    req.onerror = (): void => {
      reject(req.error ?? new Error('open failed'));
    };
  });
}

beforeEach(() => {
  setIdb(new IDBFactory());
});

afterEach(() => {
  setIdb(undefined);
});

describe('requireIdb', () => {
  it('бросает типизированную ошибку без indexedDB', async () => {
    setIdb(undefined);
    await expect(idbHandlers.list()).rejects.toMatchObject({
      appError: { messageKey: 'idb.error.unavailable' },
    });
  });
});

describe('list', () => {
  it('пустой список без баз', async () => {
    const res = await idbHandlers.list();
    expect(res.databases).toEqual([]);
    expect(typeof res.origin).toBe('string');
  });

  it('снимает версию и метаданные stores', async () => {
    await makeDb(
      'db1',
      1,
      (db) => {
        const kv = db.createObjectStore('kv', { keyPath: 'id' });
        kv.createIndex('byV', 'v');
        db.createObjectStore('log', { autoIncrement: true });
      },
      (db) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ id: 'a', v: 1 });
        tx.objectStore('kv').put({ id: 'b', v: 2 });
      },
    );
    const res = await idbHandlers.list();
    expect(res.databases).toHaveLength(1);
    const db = res.databases[0];
    expect(db?.name).toBe('db1');
    expect(db?.version).toBe(1);
    const kv = db?.stores.find((s) => s.name === 'kv');
    expect(kv?.keyPath).toBe('id');
    expect(kv?.count).toBe(2);
    expect(kv?.indexes).toContain('byV');
    const log = db?.stores.find((s) => s.name === 'log');
    expect(log?.keyPath).toBeNull();
    expect(log?.autoIncrement).toBe(true);
  });
});

describe('get', () => {
  beforeEach(async () => {
    await makeDb(
      'db1',
      1,
      (db) => {
        db.createObjectStore('kv', { keyPath: 'id' });
      },
      (db) => {
        const s = db.transaction('kv', 'readwrite').objectStore('kv');
        s.put({ id: 'a', v: 1 });
        s.put({ id: 'b', v: 2 });
      },
    );
  });

  it('возвращает записи и метаданные store', async () => {
    const res = await idbHandlers.get({ tabId: 1, db: 'db1', store: 'kv' });
    expect(res.truncated).toBe(false);
    expect(res.records).toHaveLength(2);
    expect(res.store.name).toBe('kv');
    expect(res.store.count).toBe(2);
  });

  it('усекает по лимиту записей', async () => {
    const res = await idbHandlers.get({ tabId: 1, db: 'db1', store: 'kv', limit: 1 });
    expect(res.records).toHaveLength(1);
    expect(res.truncated).toBe(true);
  });
});

describe('set', () => {
  beforeEach(async () => {
    await makeDb('db1', 1, (db) => {
      db.createObjectStore('kv', { keyPath: 'id' });
      db.createObjectStore('ool'); // out-of-line
    });
  });

  it('in-line: ключ берётся из значения', async () => {
    const r = await idbHandlers.set({
      tabId: 1,
      db: 'db1',
      store: 'kv',
      value: '{"id":"x","v":9}',
    });
    expect(r).toEqual({ ok: true });
    const got = await idbHandlers.get({ tabId: 1, db: 'db1', store: 'kv' });
    expect(got.records[0]?.value).toMatchObject({ id: 'x', v: 9 });
  });

  it('out-of-line: ключ из JSON-кодированного key', async () => {
    const r = await idbHandlers.set({
      tabId: 1,
      db: 'db1',
      store: 'ool',
      key: '"k1"',
      value: '{"hello":"world"}',
    });
    expect(r).toEqual({ ok: true });
    const got = await idbHandlers.get({ tabId: 1, db: 'db1', store: 'ool' });
    expect(got.records[0]?.keyDisplay).toBe('k1');
    expect(got.records[0]?.value).toMatchObject({ hello: 'world' });
  });

  it('out-of-line без key → отклоняется', async () => {
    await expect(
      idbHandlers.set({ tabId: 1, db: 'db1', store: 'ool', value: '{"a":1}' }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('невалидный JSON → idb.error.badValue', async () => {
    await expect(
      idbHandlers.set({ tabId: 1, db: 'db1', store: 'kv', value: '{not json' }),
    ).rejects.toMatchObject({ appError: { messageKey: 'idb.error.badValue' } });
  });
});

describe('remove', () => {
  it('удаляет запись по ключу', async () => {
    await makeDb(
      'db1',
      1,
      (db) => {
        db.createObjectStore('kv', { keyPath: 'id' });
      },
      (db) => {
        db.transaction('kv', 'readwrite').objectStore('kv').put({ id: 'a', v: 1 });
      },
    );
    const r = await idbHandlers.remove({ tabId: 1, db: 'db1', store: 'kv', key: '"a"' });
    expect(r).toEqual({ ok: true });
    const got = await idbHandlers.get({ tabId: 1, db: 'db1', store: 'kv' });
    expect(got.records).toHaveLength(0);
  });
});

describe('clear', () => {
  beforeEach(async () => {
    await makeDb(
      'db1',
      1,
      (db) => {
        db.createObjectStore('kv', { keyPath: 'id' });
      },
      (db) => {
        const s = db.transaction('kv', 'readwrite').objectStore('kv');
        s.put({ id: 'a' });
        s.put({ id: 'b' });
      },
    );
  });

  it('store-level: очищает только store', async () => {
    const r = await idbHandlers.clear({ tabId: 1, db: 'db1', store: 'kv' });
    expect(r.removed).toBe(2);
    const got = await idbHandlers.get({ tabId: 1, db: 'db1', store: 'kv' });
    expect(got.records).toHaveLength(0);
  });

  it('db-level: удаляет базу целиком', async () => {
    const r = await idbHandlers.clear({ tabId: 1, db: 'db1' });
    expect(r.removed).toBe(2);
    const list = await idbHandlers.list();
    expect(list.databases).toHaveLength(0);
  });

  it('domain-level: удаляет все базы', async () => {
    await makeDb('db2', 1, (db) => {
      db.createObjectStore('s');
    });
    const r = await idbHandlers.clear({ tabId: 1 });
    expect(r.removed).toBeGreaterThanOrEqual(2);
    const list = await idbHandlers.list();
    expect(list.databases).toHaveLength(0);
  });
});

describe('installIdbContentHost', () => {
  it('идемпотентен', () => {
    expect(() => {
      installIdbContentHost();
      installIdbContentHost();
    }).not.toThrow();
  });
});

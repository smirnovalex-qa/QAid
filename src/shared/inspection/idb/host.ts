/**
 * Content-хост IndexedDB (TASK-031): обходит и правит `indexedDB` активной вкладки в
 * ISOLATED world по RPC `idb/*` (TASK-013).
 *
 * Живёт в `shared/inspection/idb` (а НЕ в `features/`), т.к. попадает в content-бандл,
 * который не должен импортировать фичи. Использует страничный глобал `indexedDB`
 * (+ `location`); `chrome.*`/preact/платформу не трогает — обмен идёт через
 * `registerHandler` шины. Свой роутер НЕ поднимает — его ставит инспекционный host
 * (`installInspectionHost`), с которым модуль проводится оркестратором в одном бандле.
 *
 * IDB асинхронна и бинарна: обход курсором с бюджетом записей и таймаутом; значения —
 * `structuredClone`-типы, поэтому наружу идёт безопасный JSON (`toRecord`/`toSafeJson`),
 * а не сырое значение. Правка/удаление адресуют запись JSON-кодированным ключом.
 *
 * Импорт `./messages` (side-effect) кладёт zod-схемы `idb/*` в реестр content-реалма
 * — иначе роутер не провалидирует входящий запрос.
 */
import './messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf } from '@/shared/messaging/contract';
import { AppErrorException, appError } from '@/shared/errors';
import { decodeKey, parseEditValue, toRecord } from './logic';
import { IDB_RECORD_BUDGET, IDB_TIMEOUT_MS } from './types';
import type { IdbDatabaseSummary, IdbRecord, IdbStoreInfo } from './types';

/** Возвращает страничный `indexedDB` либо бросает типизированную ошибку недоступности. */
function requireIdb(): IDBFactory {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (idb === undefined || typeof idb.databases !== 'function') {
    throw new AppErrorException(
      appError('INTERNAL', 'indexedDB unavailable', undefined, 'idb.error.unavailable'),
    );
  }
  return idb;
}

/** Origin вкладки для отображения (пустая строка, если недоступен). */
function pageOrigin(): string {
  return (globalThis as { location?: { origin?: string } }).location?.origin ?? '';
}

/** Обёртка колбэк-запроса IDB в промис. */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('idb request failed'));
    };
  });
}

/** Открывает существующую базу по текущей версии (без апгрейда). */
function openDatabase(idb: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(name);
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('idb open failed'));
    };
    request.onblocked = (): void => {
      reject(new Error('idb open blocked'));
    };
  });
}

/** Удаляет базу целиком. */
function deleteDatabase(idb: IDBFactory, name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = idb.deleteDatabase(name);
    request.onsuccess = (): void => {
      resolve();
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('idb delete failed'));
    };
    request.onblocked = (): void => {
      // Открытые соединения в других контекстах блокируют удаление: не зависаем.
      resolve();
    };
  });
}

/** Нормализует `keyPath` object store к сериализуемому виду. */
function normalizeKeyPath(keyPath: string | string[] | null): string | string[] | null {
  if (keyPath === null) return null;
  return Array.isArray(keyPath) ? [...keyPath] : keyPath;
}

/** Снимает метаданные одного object store (в собственной read-only транзакции). */
async function readStoreInfo(db: IDBDatabase, storeName: string): Promise<IdbStoreInfo> {
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const count = await promisify(store.count());
  return {
    name: storeName,
    keyPath: normalizeKeyPath(store.keyPath),
    autoIncrement: store.autoIncrement,
    indexes: [...store.indexNames],
    count,
  };
}

/** Снимает сводку одной базы (версия + метаданные всех stores). */
async function readDbSummary(idb: IDBFactory, name: string): Promise<IdbDatabaseSummary> {
  const db = await openDatabase(idb, name);
  try {
    const stores: IdbStoreInfo[] = [];
    for (const storeName of [...db.objectStoreNames]) {
      stores.push(await readStoreInfo(db, storeName));
    }
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
}

/** Обход store курсором с бюджетом записей и таймаутом (устойчиво к «зависшим» базам). */
function readRecords(
  db: IDBDatabase,
  storeName: string,
  limit: number,
): Promise<{ records: IdbRecord[]; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const records: IdbRecord[] = [];
    const deadline = Date.now() + IDB_TIMEOUT_MS;
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
    request.onerror = (): void => {
      reject(request.error ?? new Error('idb cursor failed'));
    };
    request.onsuccess = (): void => {
      const cursor = request.result;
      if (cursor === null) {
        resolve({ records, truncated: false });
        return;
      }
      if (records.length >= limit || Date.now() > deadline) {
        resolve({ records, truncated: true });
        return;
      }
      records.push(toRecord(cursor.key, cursor.value));
      cursor.continue();
    };
  });
}

/** Суммирует число записей всех stores базы (для отчёта об удалении базы). */
async function countDatabase(idb: IDBFactory, name: string): Promise<number> {
  const db = await openDatabase(idb, name);
  try {
    let total = 0;
    for (const storeName of [...db.objectStoreNames]) {
      total += await promisify(
        db.transaction(storeName, 'readonly').objectStore(storeName).count(),
      );
    }
    return total;
  } finally {
    db.close();
  }
}

// ── хендлеры RPC ────────────────────────────────────────────────────────────

async function list(): Promise<{ databases: IdbDatabaseSummary[]; origin: string }> {
  const idb = requireIdb();
  const infos = await idb.databases();
  const databases: IdbDatabaseSummary[] = [];
  for (const info of infos) {
    if (info.name === undefined) continue;
    try {
      databases.push(await readDbSummary(idb, info.name));
    } catch {
      // Недоступная/битая база не должна ронять список остальных.
    }
  }
  return { databases, origin: pageOrigin() };
}

async function get(
  req: RequestOf<'idb/get'>,
): Promise<{ records: IdbRecord[]; truncated: boolean; store: IdbStoreInfo }> {
  const idb = requireIdb();
  const db = await openDatabase(idb, req.db);
  try {
    const store = await readStoreInfo(db, req.store);
    const { records, truncated } = await readRecords(db, req.store, req.limit ?? IDB_RECORD_BUDGET);
    return { records, truncated, store };
  } finally {
    db.close();
  }
}

async function set(req: RequestOf<'idb/set'>): Promise<{ ok: true }> {
  const parsed = parseEditValue(req.value);
  if (!parsed.ok) {
    throw new AppErrorException(
      appError('VALIDATION', `bad idb value: ${parsed.error}`, undefined, 'idb.error.badValue'),
    );
  }
  const idb = requireIdb();
  const db = await openDatabase(idb, req.db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(req.store, 'readwrite');
      const store = tx.objectStore(req.store);
      // In-line ключ (`keyPath`) берётся из значения; out-of-line — из явного `key`.
      // `keyPath` в lib.dom типизирован как `string | string[]`, но в рантайме для
      // out-of-line-хранилищ он `null` — расширяем тип, чтобы проверка была корректной.
      const keyPath = store.keyPath as string | string[] | null;
      if (keyPath === null) {
        if (req.key === undefined) {
          reject(new Error('missing out-of-line key'));
          return;
        }
        store.put(parsed.value, decodeKey(req.key));
      } else {
        store.put(parsed.value);
      }
      tx.oncomplete = (): void => {
        resolve();
      };
      tx.onerror = (): void => {
        reject(tx.error ?? new Error('idb put failed'));
      };
      tx.onabort = (): void => {
        reject(tx.error ?? new Error('idb put aborted'));
      };
    });
    return { ok: true as const };
  } finally {
    db.close();
  }
}

async function remove(req: RequestOf<'idb/remove'>): Promise<{ ok: true }> {
  const idb = requireIdb();
  const db = await openDatabase(idb, req.db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(req.store, 'readwrite');
      tx.objectStore(req.store).delete(decodeKey(req.key));
      tx.oncomplete = (): void => {
        resolve();
      };
      tx.onerror = (): void => {
        reject(tx.error ?? new Error('idb delete failed'));
      };
      tx.onabort = (): void => {
        reject(tx.error ?? new Error('idb delete aborted'));
      };
    });
    return { ok: true as const };
  } finally {
    db.close();
  }
}

async function clear(req: RequestOf<'idb/clear'>): Promise<{ removed: number }> {
  const idb = requireIdb();

  // Ни базы, ни store → быстрая очистка всех баз домена.
  if (req.db === undefined) {
    const infos = await idb.databases();
    let removed = 0;
    for (const info of infos) {
      if (info.name === undefined) continue;
      try {
        removed += await countDatabase(idb, info.name);
        await deleteDatabase(idb, info.name);
      } catch {
        // Недоступная база не блокирует очистку остальных.
      }
    }
    return { removed };
  }

  // Только база → удалить базу целиком (отчёт — суммарное число записей).
  if (req.store === undefined) {
    let removed = 0;
    try {
      removed = await countDatabase(idb, req.db);
    } catch {
      removed = 0;
    }
    await deleteDatabase(idb, req.db);
    return { removed };
  }

  // База + store → очистить только этот store.
  const store = req.store;
  const db = await openDatabase(idb, req.db);
  try {
    return await new Promise<{ removed: number }>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      const countReq = objectStore.count();
      countReq.onsuccess = (): void => {
        objectStore.clear();
      };
      countReq.onerror = (): void => {
        reject(countReq.error ?? new Error('idb count failed'));
      };
      tx.oncomplete = (): void => {
        resolve({ removed: countReq.result });
      };
      tx.onerror = (): void => {
        reject(tx.error ?? new Error('idb clear failed'));
      };
      tx.onabort = (): void => {
        reject(tx.error ?? new Error('idb clear aborted'));
      };
    });
  } finally {
    db.close();
  }
}

/**
 * Хендлеры IndexedDB. Экспортируются для прямого юнит-тестирования (через инъекцию
 * фейкового `indexedDB` в глобал): те же функции регистрируются в шине из
 * `installIdbContentHost`.
 */
export const idbHandlers = { list, get, set, remove, clear };

/** Идемпотентность: шина не умеет разрегистрировать хендлеры — защита от повтора. */
let installed = false;

/**
 * Регистрирует хендлеры `idb/*` в шине content-реалма. Идемпотентно: повторная
 * инъекция бандла не перерегистрирует хендлеры (`registerHandler` бросает на дубликат).
 */
export function installIdbContentHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('idb/list', list);
  registerHandler('idb/get', get);
  registerHandler('idb/set', set);
  registerHandler('idb/remove', remove);
  registerHandler('idb/clear', clear);
}

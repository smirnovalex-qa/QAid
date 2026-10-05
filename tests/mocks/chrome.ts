/**
 * Единый переиспользуемый мок `chrome.*` для unit/компонентной среды (TASK-011 §7).
 *
 * Минимальный, но **stateful**: `chrome.storage.local` держит реальный in-memory
 * объект, поэтому тесты, читающие сохранённую под-вкладку/настройки (TASK-005,
 * TASK-009/010), проходят end-to-end. Расширять по мере появления новых
 * используемых API, не добавляя неиспользуемое.
 *
 * Каждый метод — `vi.fn()` (для ассертов вызовов) c осмысленным поведением по
 * умолчанию. Методы `storage.local` работают **dual-mode**: и как promise
 * (наш `platform.storageLocal` дергает их напрямую), и через callback (так их
 * вызывает `webextension-polyfill`). `webextension-polyfill` при импорте требует
 * `chrome.runtime.id`, поэтому мок ставит его синхронно.
 */
import { vi } from 'vitest';

type StorageChange = { oldValue?: unknown; newValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, area: string) => void;
type StorageGetKeys = string | string[] | Record<string, unknown> | null | undefined;

/** In-memory backing store и подписчики `onChanged` — общие для всех методов мока. */
const memory = new Map<string, unknown>();
const changeListeners = new Set<ChangeListener>();

function computeGet(keys: StorageGetKeys): Record<string, unknown> {
  if (keys === null || keys === undefined) return Object.fromEntries(memory);
  if (typeof keys === 'string') {
    return memory.has(keys) ? { [keys]: memory.get(keys) } : {};
  }
  if (Array.isArray(keys)) {
    const result: Record<string, unknown> = {};
    for (const key of keys) if (memory.has(key)) result[key] = memory.get(key);
    return result;
  }
  const result: Record<string, unknown> = { ...keys };
  for (const key of Object.keys(keys)) if (memory.has(key)) result[key] = memory.get(key);
  return result;
}

function fireChanges(changes: Record<string, StorageChange>): void {
  for (const listener of changeListeners) listener(changes, 'local');
}

/** Оборачивает синхронную реализацию в функцию, работающую и как promise, и с callback. */
function dual<Result>(compute: (...args: never[]) => Result) {
  return (...args: unknown[]): Promise<Result> | undefined => {
    const last = args[args.length - 1];
    const callback = typeof last === 'function' ? (last as (value: Result) => void) : undefined;
    const payload = (callback ? args.slice(0, -1) : args) as never[];
    const result = compute(...payload);
    if (callback) {
      callback(result);
      return undefined;
    }
    return Promise.resolve(result);
  };
}

const storageLocal = {
  get: vi.fn(dual((keys?: StorageGetKeys) => computeGet(keys))),
  set: vi.fn(
    dual((items: Record<string, unknown>) => {
      const changes: Record<string, StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: memory.get(key), newValue: value };
        memory.set(key, value);
      }
      fireChanges(changes);
    }),
  ),
  remove: vi.fn(
    dual((keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, StorageChange> = {};
      for (const key of list) {
        if (memory.has(key)) {
          changes[key] = { oldValue: memory.get(key) };
          memory.delete(key);
        }
      }
      fireChanges(changes);
    }),
  ),
  clear: vi.fn(
    dual(() => {
      const changes: Record<string, StorageChange> = {};
      for (const [key, value] of memory) changes[key] = { oldValue: value };
      memory.clear();
      fireChanges(changes);
    }),
  ),
};

const runtime = {
  id: 'test-extension',
  getURL: vi.fn((path: string) => `chrome-extension://test-extension/${path.replace(/^\//, '')}`),
  sendMessage: vi.fn(() => Promise.resolve(undefined)),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
};

/**
 * `chrome.permissions` — минимальный stateful мок для брокера прав (TASK-013):
 * дефолтно всё «выдано» (`request`/`contains` → true), dual-mode (promise+callback,
 * т.к. webextension-polyfill дергает chrome через callback). Юнит-тесты брокера
 * инъектируют собственный seam и мок не трогают — он здесь для сохранности
 * платформенного слоя и интеграционных сценариев.
 */
const permissions = {
  request: vi.fn(dual(() => true)),
  contains: vi.fn(dual(() => true)),
  onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
};

/** `chrome.scripting` — заглушка инъекции (успех по умолчанию). */
const scripting = {
  executeScript: vi.fn(dual(() => [] as unknown[])),
};

/** `chrome.tabs` — минимум для адресации инспекционного RPC. */
const tabs = {
  query: vi.fn(dual(() => [{ id: 1 }])),
  sendMessage: vi.fn(() => Promise.resolve(undefined)),
};

const storage = {
  local: storageLocal,
  onChanged: {
    addListener: vi.fn((listener: ChangeListener) => changeListeners.add(listener)),
    removeListener: vi.fn((listener: ChangeListener) => changeListeners.delete(listener)),
  },
};

/** Собранный мок. Экспортируется для точечных ассертов из тестов. */
export const chromeMock = { runtime, storage, permissions, scripting, tabs };

/** Прямой доступ к backing-store — для инспекции/подготовки данных в тестах. */
export function storageMemory(): Map<string, unknown> {
  return memory;
}

/** Ставит мок в `globalThis.chrome`. Вызывается один раз из setup-файла. */
export function installChromeMock(): void {
  (globalThis as { chrome?: unknown }).chrome = chromeMock;
}

/** Сбрасывает состояние между тестами: чистит стор, подписчиков и счётчики вызовов. */
export function resetChromeMock(): void {
  memory.clear();
  changeListeners.clear();
  for (const fn of [
    storageLocal.get,
    storageLocal.set,
    storageLocal.remove,
    storageLocal.clear,
    runtime.getURL,
    runtime.sendMessage,
    runtime.onMessage.addListener,
    runtime.onMessage.removeListener,
    storage.onChanged.addListener,
    storage.onChanged.removeListener,
    permissions.request,
    permissions.contains,
    permissions.onAdded.addListener,
    permissions.onAdded.removeListener,
    permissions.onRemoved.addListener,
    permissions.onRemoved.removeListener,
    scripting.executeScript,
    tabs.query,
    tabs.sendMessage,
  ]) {
    fn.mockClear();
  }
}

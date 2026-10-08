/**
 * Тесты FSA-транспорта Agent Handoff (TASK-040). jsdom не реализует ни File System
 * Access API, ни IndexedDB, поэтому:
 *  - `indexedDB` подменяется КРОШЕЧНЫМ фейком по ссылке (структурный клон реального
 *    IDB стёр бы методы у fake-handle — тут значение хранится как есть);
 *  - directory-handle — фейк с цепочкой `getDirectoryHandle → getFileHandle →
 *    createWritable → write → close` и Permissions-методами.
 * Покрываем: нет папки, отказ прав, счастливый путь (3 файла + перезапись latest.md),
 * исключение → failed, и детект поддержки API.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HANDOFF_DIR } from '../../types';
import type { AgentHandoffPackage } from '../../types';
import type { BugArtifact } from '../../../types';
import { isFsAccessSupported, writeProjectFiles } from '../fs-access';

// ── фейковый keyval-IDB (по ссылке, без структурного клона) ─────────────────────

function makeFakeIdb(store: Map<string, unknown>): IDBFactory {
  const objectStore = {
    get(key: string) {
      const req: {
        result?: unknown;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      } = { onsuccess: null, onerror: null };
      queueMicrotask(() => {
        req.result = store.get(key);
        req.onsuccess?.();
      });
      return req;
    },
    put(value: unknown, key: string) {
      store.set(key, value);
      return {};
    },
    delete(key: string) {
      store.delete(key);
      return {};
    },
  };
  const makeTx = () => {
    const tx: {
      objectStore: () => typeof objectStore;
      oncomplete: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      error: unknown;
    } = {
      objectStore: () => objectStore,
      oncomplete: null,
      onerror: null,
      onabort: null,
      error: null,
    };
    queueMicrotask(() => {
      tx.oncomplete?.();
    });
    return tx;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => objectStore,
    transaction: () => makeTx(),
    close: () => undefined,
  };
  return {
    open() {
      const req: {
        result?: unknown;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      } = { onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  } as unknown as IDBFactory;
}

function setIdb(value: unknown): void {
  (globalThis as { indexedDB?: unknown }).indexedDB = value;
}

// ── фейковый directory-handle ───────────────────────────────────────────────────

interface WrittenFile {
  name: string;
  contents: string;
}

interface HandleOptions {
  written: WrittenFile[];
  dirCalls: string[];
  fileCalls: { name: string; create: boolean }[];
  permission?: PermissionState;
  throwOnFile?: boolean;
}

function makeDirHandle(opts: HandleOptions): unknown {
  // Методы намеренно НЕ `async` (без внутреннего await), чтобы не ловить
  // require-await; форму Promise сохраняем через явный Promise.resolve/reject.
  const handle = {
    queryPermission: (): Promise<PermissionState> => Promise.resolve(opts.permission ?? 'granted'),
    requestPermission: (): Promise<PermissionState> =>
      Promise.resolve(opts.permission ?? 'granted'),
    getDirectoryHandle: (name: string): Promise<unknown> => {
      opts.dirCalls.push(name);
      return Promise.resolve(handle);
    },
    getFileHandle: (name: string, o?: { create?: boolean }): Promise<unknown> => {
      opts.fileCalls.push({ name, create: o?.create ?? false });
      if (opts.throwOnFile === true) return Promise.reject(new Error('write boom'));
      return Promise.resolve({
        createWritable: (): Promise<unknown> => {
          let buf = '';
          return Promise.resolve({
            write: (chunk: string): Promise<void> => {
              buf = chunk;
              return Promise.resolve();
            },
            close: (): Promise<void> => {
              opts.written.push({ name, contents: buf });
              return Promise.resolve();
            },
          });
        },
      });
    },
  };
  return handle;
}

// ── фикстуры ────────────────────────────────────────────────────────────────────

const artifact: BugArtifact = {
  version: 1,
  capturedAt: '2026-09-19T12:00:00.000Z',
  meta: { url: 'https://example.com', title: 'Example' },
  environment: null,
  storage: null,
  console: null,
  network: null,
  timeline: null,
  note: null,
};

function makePackage(): AgentHandoffPackage {
  return {
    packageVersion: 1,
    createdAt: '2026-09-19T12:34:56.000Z',
    slug: 'example-bug',
    fullMarkdown: '# full markdown',
    fullJson: '{"full":true}',
    compactPrompt: 'compact prompt',
    artifact,
  };
}

afterEach(() => {
  setIdb(undefined);
});

describe('isFsAccessSupported', () => {
  it('false без window.showDirectoryPicker', () => {
    expect(isFsAccessSupported()).toBe(false);
  });

  it('true при наличии window.showDirectoryPicker', () => {
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = () =>
      Promise.resolve({});
    try {
      expect(isFsAccessSupported()).toBe(true);
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    }
  });
});

describe('writeProjectFiles', () => {
  it('ok:false noDir, когда папка не выбрана', async () => {
    setIdb(makeFakeIdb(new Map()));
    const result = await writeProjectFiles(makePackage());
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bugReport.handoff.fs.noDir');
    expect(result.written).toEqual([]);
    expect(result.latestPath).toBe(`${HANDOFF_DIR}/latest.md`);
  });

  it('ok:false noDir, когда indexedDB недоступен', async () => {
    setIdb(undefined);
    const result = await writeProjectFiles(makePackage());
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bugReport.handoff.fs.noDir');
  });

  it('ok:false denied при отказе в правах readwrite', async () => {
    const opts: HandleOptions = { written: [], dirCalls: [], fileCalls: [], permission: 'denied' };
    const store = new Map<string, unknown>([['project-root', makeDirHandle(opts)]]);
    setIdb(makeFakeIdb(store));
    const result = await writeProjectFiles(makePackage());
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bugReport.handoff.fs.denied');
    expect(opts.fileCalls).toEqual([]);
  });

  it('счастливый путь: пишет 3 файла и перезаписывает latest.md', async () => {
    const opts: HandleOptions = { written: [], dirCalls: [], fileCalls: [], permission: 'granted' };
    const store = new Map<string, unknown>([['project-root', makeDirHandle(opts)]]);
    setIdb(makeFakeIdb(store));

    const result = await writeProjectFiles(makePackage());

    expect(result.ok).toBe(true);
    expect(result.latestPath).toBe(`${HANDOFF_DIR}/latest.md`);
    // Вложенные каталоги из HANDOFF_DIR (.qaid → bug-reports).
    expect(opts.dirCalls).toEqual(['.qaid', 'bug-reports']);
    // Три файла: <slug>-<ts>.md, <slug>-<ts>.json, latest.md.
    expect(opts.written).toEqual([
      { name: 'example-bug-20260919123456.md', contents: '# full markdown' },
      { name: 'example-bug-20260919123456.json', contents: '{"full":true}' },
      { name: 'latest.md', contents: '# full markdown' },
    ]);
    expect(result.written).toEqual([
      `${HANDOFF_DIR}/example-bug-20260919123456.md`,
      `${HANDOFF_DIR}/example-bug-20260919123456.json`,
      `${HANDOFF_DIR}/latest.md`,
    ]);
    // latest.md запрошен с create:true (перезапись разрешена).
    expect(opts.fileCalls.some((c) => c.name === 'latest.md' && c.create)).toBe(true);
  });

  it('ok:false failed при исключении во время записи', async () => {
    const opts: HandleOptions = {
      written: [],
      dirCalls: [],
      fileCalls: [],
      permission: 'granted',
      throwOnFile: true,
    };
    const store = new Map<string, unknown>([['project-root', makeDirHandle(opts)]]);
    setIdb(makeFakeIdb(store));
    const result = await writeProjectFiles(makePackage());
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bugReport.handoff.fs.failed');
  });
});

/**
 * Транспорт «папка проекта» для Agent Handoff (TASK-040): пишет артефакты бага
 * прямо в корень проекта через File System Access API — БЕЗ установки стороннего
 * софта и без раскрытия абсолютного пути (браузер отдаёт живой handle, а не путь).
 *
 * Работает только в document-контексте (popup/side panel), где есть DOM и
 * `window.showDirectoryPicker`. Выбранный `FileSystemDirectoryHandle` переживает
 * перезагрузку расширения: он структурно клонируется в собственный крошечный
 * keyval-стор IndexedDB (`qaid-handoff` → `handles` → `project-root`). Это
 * ХРАНИЛИЩЕ РАСШИРЕНИЯ (persist handle), а не инспекция IDB страницы (та живёт в
 * `shared/inspection/idb`).
 *
 * Любой сбой — деградация данными, не throw через границу: keyval-обёртки на любой
 * ошибке возвращают `undefined`/`false`, а `writeProjectFiles` — `FsWriteResult`
 * с i18n-КЛЮЧОМ причины в `error` (UI переводит). Ключи, которые может вернуть
 * этот модуль (только референс — в каталоги их добавляет оркестратор):
 *   `bugReport.handoff.fs.noDir`   — папка ещё не выбрана;
 *   `bugReport.handoff.fs.denied`  — нет прав readwrite на папку;
 *   `bugReport.handoff.fs.failed`  — исключение при записи.
 */
import { logger } from '@/shared/logger';
import { HANDOFF_DIR } from '../types';
import type { AgentHandoffPackage, FsWriteResult } from '../types';

// ── типы FSA, которых нет/частично нет в lib.dom ────────────────────────────────

/** Дескриптор запроса прав на handle (Permissions API для FSA). */
interface FsaPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

/**
 * Права на handle — экспериментальная часть FSA, отсутствует в lib.dom. Методы
 * опциональны: реализация без них (или фейк в тестах) трактуется как разрешённая.
 */
interface PermissionAwareHandle {
  queryPermission?: (descriptor: FsaPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: FsaPermissionDescriptor) => Promise<PermissionState>;
}

/** Handle каталога проекта с правами (пересечение стандартного типа и прав). */
type ProjectDirectoryHandle = FileSystemDirectoryHandle & PermissionAwareHandle;

/** `window.showDirectoryPicker` отсутствует в lib.dom — узкий локальный тип. */
interface DirectoryPickerWindow {
  showDirectoryPicker: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
}

// ── keyval-стор для persist handle (крошечная обёртка над IndexedDB) ────────────

const DB_NAME = 'qaid-handoff';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'project-root';

/** Страничный `indexedDB` как опциональный (в некоторых средах отсутствует). */
function getIndexedDb(): IDBFactory | undefined {
  return (globalThis as { indexedDB?: IDBFactory }).indexedDB;
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

/** Открывает keyval-базу, создавая store на апгрейде. */
function openHandleDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = (): void => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('idb open failed'));
    };
  });
}

/** Загружает persisted handle (или `undefined` при отсутствии/сбое). */
async function loadHandle(): Promise<ProjectDirectoryHandle | undefined> {
  const idb = getIndexedDb();
  if (idb === undefined) return undefined;
  try {
    const db = await openHandleDb(idb);
    try {
      const value = await promisify<unknown>(
        db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY),
      );
      return value === undefined ? undefined : (value as ProjectDirectoryHandle);
    } finally {
      db.close();
    }
  } catch (err) {
    logger.debug('handoff/fs: load handle failed', err);
    return undefined;
  }
}

/** Сохраняет выбранный handle. `true` — успех. */
async function saveHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const idb = getIndexedDb();
  if (idb === undefined) return false;
  try {
    const db = await openHandleDb(idb);
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
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
      return true;
    } finally {
      db.close();
    }
  } catch (err) {
    logger.debug('handoff/fs: save handle failed', err);
    return false;
  }
}

/** Забывает persisted handle (тихо деградирует при сбое). */
async function deleteHandle(): Promise<void> {
  const idb = getIndexedDb();
  if (idb === undefined) return;
  try {
    const db = await openHandleDb(idb);
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
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
    } finally {
      db.close();
    }
  } catch (err) {
    logger.debug('handoff/fs: delete handle failed', err);
  }
}

// ── публичный API транспорта ────────────────────────────────────────────────────

/** File System Access API присутствует (document-контекст с `showDirectoryPicker`). */
export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Просит пользователя выбрать корень проекта (под жестом) и persist'ит handle.
 * `true` — папка выбрана и сохранена; `false` — API нет, отмена или сбой.
 */
export async function pickProjectDirectory(): Promise<boolean> {
  if (!isFsAccessSupported()) return false;
  try {
    const handle = await (window as unknown as DirectoryPickerWindow).showDirectoryPicker({
      mode: 'readwrite',
    });
    return await saveHandle(handle);
  } catch (err) {
    // Отмена диалога (AbortError) или отказ — не сбой, деградируем в `false`.
    logger.debug('handoff/fs: directory pick cancelled/failed', err);
    return false;
  }
}

/** Выбрана ли уже папка проекта (есть persisted handle). */
export async function hasProjectDirectory(): Promise<boolean> {
  return (await loadHandle()) !== undefined;
}

/** Забывает выбранную папку проекта. */
export async function forgetProjectDirectory(): Promise<void> {
  await deleteHandle();
}

/** Гарантирует право readwrite на handle: `query` → при необходимости `request`. */
async function ensureWritePermission(handle: ProjectDirectoryHandle): Promise<boolean> {
  const descriptor: FsaPermissionDescriptor = { mode: 'readwrite' };
  try {
    if (typeof handle.queryPermission === 'function') {
      if ((await handle.queryPermission(descriptor)) === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      return (await handle.requestPermission(descriptor)) === 'granted';
    }
    // Реализация без Permissions-методов (напр. фейк в тестах) — считаем разрешённой.
    return true;
  } catch (err) {
    logger.debug('handoff/fs: permission check failed', err);
    return false;
  }
}

/** Компактный штамп времени для имени файла из ISO `createdAt` (`YYYYMMDDHHmmss`). */
function compactTimestamp(iso: string): string {
  return iso.replace(/\D/g, '').slice(0, 14);
}

/** Атомарно пишет один файл в каталог (`createWritable` → `write` → `close`). */
async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  contents: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

/**
 * Реализация `HandoffTransports.writeProjectFiles`: пишет три файла в
 * `${HANDOFF_DIR}` корня проекта — `<slug>-<ts>.md`, `<slug>-<ts>.json` (никогда не
 * перезаписываются) и `latest.md` (перезаписываемый «свежий» указатель). Ошибки —
 * данными (`FsWriteResult.error` = i18n-ключ), без throw через границу.
 */
export async function writeProjectFiles(pkg: AgentHandoffPackage): Promise<FsWriteResult> {
  const latestPath = `${HANDOFF_DIR}/latest.md`;

  const handle = await loadHandle();
  if (handle === undefined) {
    return { ok: false, written: [], latestPath, error: 'bugReport.handoff.fs.noDir' };
  }

  const permitted = await ensureWritePermission(handle);
  if (!permitted) {
    return { ok: false, written: [], latestPath, error: 'bugReport.handoff.fs.denied' };
  }

  try {
    // Вложенные каталоги из `HANDOFF_DIR` (`.qaid` → `bug-reports`).
    let dir: FileSystemDirectoryHandle = handle;
    for (const segment of HANDOFF_DIR.split('/')) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }

    const ts = compactTimestamp(pkg.createdAt);
    const mdName = `${pkg.slug}-${ts}.md`;
    const jsonName = `${pkg.slug}-${ts}.json`;

    await writeFile(dir, mdName, pkg.fullMarkdown);
    await writeFile(dir, jsonName, pkg.fullJson);
    // `latest.md` перезаписывается всегда — «свежий» указатель для компактного промпта.
    await writeFile(dir, 'latest.md', pkg.fullMarkdown);

    return {
      ok: true,
      written: [`${HANDOFF_DIR}/${mdName}`, `${HANDOFF_DIR}/${jsonName}`, latestPath],
      latestPath,
    };
  } catch (err) {
    logger.error('handoff/fs: write project files failed', err);
    return { ok: false, written: [], latestPath, error: 'bugReport.handoff.fs.failed' };
  }
}

// ── generic read/write произвольного текстового файла проекта (TASK-042) ──────────
//
// Авто-обнаружение (discovery.ts) пишет НЕ артефакт бага, а вспомогательные файлы
// (`CLAUDE.md`, `.cursor/rules/*.md`, `.mcp.json`), причём идемпотентно: прочитать →
// смержить чистой функцией → записать. Отсюда две generic-операции над выбранным
// корнем проекта. Пути относительные, с `/`-разделителем; вложенные каталоги на записи
// создаются, на чтении — нет.

/** Разбивает относительный путь на сегменты каталогов + имя файла. */
function splitRelPath(relPath: string): { dirs: string[]; name: string } {
  const parts = relPath.split('/').filter((s) => s.length > 0);
  const name = parts.pop() ?? '';
  return { dirs: parts, name };
}

/**
 * Читает текстовый файл из корня проекта по относительному пути. `null`, если папка не
 * выбрана, файла нет или доступ не получен (тихая деградация — вызывающий начинает с
 * пустого содержимого для idempotent-мерджа).
 */
export async function readProjectTextFile(relPath: string): Promise<string | null> {
  const handle = await loadHandle();
  if (handle === undefined) return null;
  if (!(await ensureWritePermission(handle))) return null;
  const { dirs, name } = splitRelPath(relPath);
  if (name === '') return null;
  try {
    let dir: FileSystemDirectoryHandle = handle;
    for (const segment of dirs) dir = await dir.getDirectoryHandle(segment, { create: false });
    const fileHandle = await dir.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (err) {
    // NotFoundError и т.п. — нормальная ветка «файла ещё нет».
    logger.debug('handoff/fs: read project file miss', err);
    return null;
  }
}

/**
 * Записывает текстовый файл в корень проекта по относительному пути (создавая вложенные
 * каталоги). `true` — успех; ошибки деградируют в `false` (без throw через границу).
 */
export async function writeProjectTextFile(relPath: string, content: string): Promise<boolean> {
  const handle = await loadHandle();
  if (handle === undefined) return false;
  if (!(await ensureWritePermission(handle))) return false;
  const { dirs, name } = splitRelPath(relPath);
  if (name === '') return false;
  try {
    let dir: FileSystemDirectoryHandle = handle;
    for (const segment of dirs) dir = await dir.getDirectoryHandle(segment, { create: true });
    await writeFile(dir, name, content);
    return true;
  } catch (err) {
    logger.error('handoff/fs: write project text file failed', err);
    return false;
  }
}

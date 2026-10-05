/**
 * Чистая логика под-фичи «IndexedDB в редакторе состояния» (TASK-031).
 *
 * БЕЗ DOM и `chrome.*`: безопасная сериализация произвольных `structuredClone`-значений
 * IndexedDB в JSON (`toSafeJson` — с пометкой непереносимого/усечённого), кодирование/
 * декодирование ключей записи для адресации при правке, zod-схемы снимков/записей,
 * разбор правки и сериализация снимка. Единственный покрытый почти-на-100% модуль
 * под-фичи (канон «core ~100%»).
 *
 * Использует лишь стандартные глобальные конструкторы (`Blob`, `ArrayBuffer`, `Map`,
 * `Date`, …) через `instanceof` с guard — это не DOM и не `chrome.*`, поэтому модуль
 * остаётся чистым (fitness §12.1) и одинаково работает в content-мире и в UI.
 */
import { z } from 'zod';
import {
  IDB_MAX_DEPTH,
  IDB_MAX_NODES,
  IDB_MAX_STRING,
  type IdbRecord,
  type IdbSnapshot,
  type SafeJson,
} from './types';

// ── безопасная сериализация значений ────────────────────────────────────────

/** Зарезервированный ключ объекта-маркера непереносимого/усечённого значения. */
export const MARKER_KEY = '@@qatb';

/** Опции сериализации значения (все с дефолтами из `types.ts`). */
export interface SerializeOptions {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxString: number;
}

const DEFAULT_OPTIONS: SerializeOptions = {
  maxDepth: IDB_MAX_DEPTH,
  maxNodes: IDB_MAX_NODES,
  maxString: IDB_MAX_STRING,
};

/** Результат сериализации: JSON-дерево + флаг, что что-то усечено/непереносимо. */
export interface SafeSerializeResult {
  readonly value: SafeJson;
  readonly truncated: boolean;
}

/** Внутренний контекст обхода (изменяемый счётчик бюджета и флаг усечения). */
interface Ctx {
  nodesLeft: number;
  truncated: boolean;
  readonly opts: SerializeOptions;
  readonly seen: WeakSet<object>;
}

/** Строит объект-маркер `{ '@@qatb': kind, ...extra }`. */
function marker(kind: string, extra?: Record<string, SafeJson>): SafeJson {
  return { [MARKER_KEY]: kind, ...(extra ?? {}) };
}

/** Имя конструктора-обёртки `ArrayBufferView` (TypedArray/DataView) для маркера. */
function viewName(value: ArrayBufferView): string {
  const ctor = (value as { constructor?: { name?: string } }).constructor;
  return ctor?.name ?? 'ArrayBufferView';
}

function isBlob(value: object): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isFileLike(value: object): value is Blob & { name: string } {
  return typeof File !== 'undefined' && value instanceof File;
}

/** Сериализует непереносимый (не-plain) объект в маркер; `null` — если это plain-контейнер. */
function markSpecialObject(value: object, ctx: Ctx): SafeJson | null {
  if (value instanceof Date) {
    ctx.truncated = true;
    return marker('date', { iso: Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString() });
  }
  if (value instanceof RegExp) {
    ctx.truncated = true;
    return marker('regexp', { source: value.source, flags: value.flags });
  }
  if (isFileLike(value)) {
    ctx.truncated = true;
    return marker('file', { name: value.name, size: value.size, type: value.type });
  }
  if (isBlob(value)) {
    ctx.truncated = true;
    return marker('blob', { size: value.size, type: value.type });
  }
  if (value instanceof ArrayBuffer) {
    ctx.truncated = true;
    return marker('arraybuffer', { byteLength: value.byteLength });
  }
  if (ArrayBuffer.isView(value)) {
    ctx.truncated = true;
    return marker('typedarray', { kind: viewName(value), byteLength: value.byteLength });
  }
  return null;
}

/** Сериализует `Map`/`Set` с учётом бюджета узлов. */
function markCollection(value: object, depth: number, ctx: Ctx): SafeJson | null {
  if (value instanceof Map) {
    const entries: SafeJson[] = [];
    for (const [k, v] of value) {
      if (ctx.nodesLeft <= 0) {
        ctx.truncated = true;
        break;
      }
      entries.push([walk(k, depth + 1, ctx), walk(v, depth + 1, ctx)]);
    }
    return marker('map', { size: value.size, entries });
  }
  if (value instanceof Set) {
    const items: SafeJson[] = [];
    for (const v of value) {
      if (ctx.nodesLeft <= 0) {
        ctx.truncated = true;
        break;
      }
      items.push(walk(v, depth + 1, ctx));
    }
    return marker('set', { size: value.size, items });
  }
  return null;
}

/** Рекурсивный обход одного значения → `SafeJson`. */
function walk(value: unknown, depth: number, ctx: Ctx): SafeJson {
  ctx.nodesLeft -= 1;
  if (ctx.nodesLeft < 0) {
    ctx.truncated = true;
    return marker('budget');
  }

  if (value === null) return null;

  const type = typeof value;
  if (type === 'string') {
    const str = value as string;
    if (str.length > ctx.opts.maxString) {
      ctx.truncated = true;
      return `${str.slice(0, ctx.opts.maxString)}…`;
    }
    return str;
  }
  if (type === 'number') {
    const num = value as number;
    if (!Number.isFinite(num)) {
      ctx.truncated = true;
      return marker('number', { text: String(num) });
    }
    return num;
  }
  if (type === 'boolean') return value as boolean;
  if (type === 'bigint') {
    ctx.truncated = true;
    return marker('bigint', { text: (value as bigint).toString() });
  }
  if (type === 'undefined') {
    ctx.truncated = true;
    return marker('undefined');
  }
  if (type === 'function' || type === 'symbol') {
    ctx.truncated = true;
    return marker(type);
  }

  // Далее — только объекты.
  const obj = value as object;

  if (depth >= ctx.opts.maxDepth) {
    ctx.truncated = true;
    return marker('max-depth');
  }
  if (ctx.seen.has(obj)) {
    ctx.truncated = true;
    return marker('circular');
  }

  const special = markSpecialObject(obj, ctx);
  if (special !== null) return special;

  ctx.seen.add(obj);
  try {
    const collection = markCollection(obj, depth, ctx);
    if (collection !== null) return collection;

    if (Array.isArray(obj)) {
      const out: SafeJson[] = [];
      for (const item of obj) {
        if (ctx.nodesLeft <= 0) {
          ctx.truncated = true;
          break;
        }
        out.push(walk(item, depth + 1, ctx));
      }
      return out;
    }

    // plain-объект (или объект с прототипом) — сериализуем перечислимые собственные поля.
    const out: Record<string, SafeJson> = {};
    for (const key of Object.keys(obj)) {
      if (ctx.nodesLeft <= 0) {
        ctx.truncated = true;
        break;
      }
      out[key] = walk((obj as Record<string, unknown>)[key], depth + 1, ctx);
    }
    return out;
  } finally {
    ctx.seen.delete(obj);
  }
}

/**
 * Сериализует произвольное значение IndexedDB в JSON-безопасное дерево. Никогда не
 * бросает: непереносимые типы → объект-маркер, превышение бюджета/глубины/длины →
 * усечение с пометкой (`truncated: true`).
 */
export function toSafeJson(
  value: unknown,
  options: Partial<SerializeOptions> = {},
): SafeSerializeResult {
  const opts: SerializeOptions = { ...DEFAULT_OPTIONS, ...options };
  const ctx: Ctx = { nodesLeft: opts.maxNodes, truncated: false, opts, seen: new WeakSet() };
  const out = walk(value, 0, ctx);
  return { value: out, truncated: ctx.truncated };
}

// ── ключи записей ─────────────────────────────────────────────────────────────

/** Один сегмент переносимого ключа (число/строка либо вложенный массив таких). */
type PortableKeyPart = number | string;

/** Переносимый (JSON-адресуемый) ключ: число/строка или (вложенный) массив таких. */
export type PortableKey = PortableKeyPart | PortableKey[];

/** true, если ключ IndexedDB состоит только из чисел/строк/массивов таких. */
export function isPortableKey(key: unknown): key is PortableKey {
  if (typeof key === 'string') return true;
  if (typeof key === 'number') return Number.isFinite(key);
  if (Array.isArray(key)) return key.every((part) => isPortableKey(part));
  return false;
}

/**
 * Кодирует ключ записи в JSON-строку для последующей адресации (правка/удаление).
 * Непереносимый ключ (Date/бинарный) → `null`: такую запись адресовать по нашему
 * JSON-транспорту нельзя (UI отключит правку/удаление строки).
 */
export function encodeKey(key: unknown): string | null {
  return isPortableKey(key) ? JSON.stringify(key) : null;
}

/** Разбирает JSON-строку ключа обратно в `IDBValidKey`. Бросает на некорректном JSON. */
export function decodeKey(text: string): PortableKey {
  const raw: unknown = JSON.parse(text);
  if (!isPortableKey(raw)) throw new Error('non-portable key');
  return raw;
}

/** Человекочитаемое представление любого ключа (в т.ч. непереносимого) для показа. */
export function keyDisplay(key: unknown): string {
  if (typeof key === 'string') return key;
  if (typeof key === 'number' || typeof key === 'bigint' || typeof key === 'boolean') {
    return String(key);
  }
  if (key === null || key === undefined) return String(key);
  if (key instanceof Date)
    return Number.isNaN(key.getTime()) ? '[invalid date]' : key.toISOString();
  if (Array.isArray(key)) return `[${key.map((k) => keyDisplay(k)).join(', ')}]`;
  if (typeof ArrayBuffer !== 'undefined') {
    if (key instanceof ArrayBuffer) return `[binary ${String(key.byteLength)}B]`;
    if (ArrayBuffer.isView(key)) return `[binary ${String(key.byteLength)}B]`;
  }
  return '[key]';
}

/** Собирает переносимую запись из «сырых» ключа/значения курсора IndexedDB. */
export function toRecord(key: unknown, value: unknown): IdbRecord {
  const safe = toSafeJson(value);
  return {
    keyText: encodeKey(key),
    keyDisplay: keyDisplay(key),
    value: safe.value,
    truncated: safe.truncated,
  };
}

// ── правка значения ───────────────────────────────────────────────────────────

/** Результат разбора текста правки значения записи. */
export type ParseValueResult =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

/**
 * Разбирает текст правки записи в значение для `put`. Пустой текст → ошибка (пустое
 * значение вероятнее опечатка, чем намерение). Некорректный JSON → ошибка (никогда
 * не бросает — UI показывает причину, а не падает).
 */
export function parseEditValue(text: string): ParseValueResult {
  if (text.trim() === '') return { ok: false, error: 'empty' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
}

// ── zod-схемы снимков ───────────────────────────────────────────────────────

/** Рекурсивная схема JSON-безопасного значения. */
export const SafeJsonSchema: z.ZodType<SafeJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SafeJsonSchema),
    z.record(SafeJsonSchema),
  ]),
);

/** Схема `keyPath` object store. */
export const KeyPathSchema = z.union([z.string(), z.array(z.string())]).nullable();

/** Схема метаданных object store. */
export const IdbStoreInfoSchema = z.object({
  name: z.string(),
  keyPath: KeyPathSchema,
  autoIncrement: z.boolean(),
  indexes: z.array(z.string()),
  count: z.number().int().nonnegative(),
});

/** Схема сводки базы (имя/версия/stores). */
export const IdbDatabaseSummarySchema = z.object({
  name: z.string(),
  version: z.number().int().nonnegative(),
  stores: z.array(IdbStoreInfoSchema),
});

/** Схема одной переносимой записи. */
export const IdbRecordSchema = z.object({
  keyText: z.string().nullable(),
  keyDisplay: z.string(),
  value: SafeJsonSchema,
  truncated: z.boolean(),
});

/** Схема store со снимком записей. */
export const IdbStoreSnapshotSchema = IdbStoreInfoSchema.extend({
  records: z.array(IdbRecordSchema),
  truncated: z.boolean(),
});

/** Схема базы со снимками stores. */
export const IdbDatabaseSnapshotSchema = z.object({
  name: z.string(),
  version: z.number().int().nonnegative(),
  stores: z.array(IdbStoreSnapshotSchema),
});

/** Схема полного снимка IndexedDB домена. */
export const IdbSnapshotSchema = z.object({
  origin: z.string(),
  databases: z.array(IdbDatabaseSnapshotSchema),
});

/** Сериализует снимок IndexedDB в человекочитаемый JSON (для экспорта/копирования). */
export function serializeSnapshot(snapshot: IdbSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/** Результат разбора внешнего снимка IndexedDB. */
export type ParseSnapshotResult =
  | { readonly ok: true; readonly value: IdbSnapshot }
  | { readonly ok: false; readonly error: string };

/** Разбирает JSON-текст снимка с zod-валидацией. Никогда не бросает. */
export function parseSnapshot(text: string): ParseSnapshotResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  const parsed = IdbSnapshotSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid-shape' };
  return { ok: true, value: parsed.data };
}

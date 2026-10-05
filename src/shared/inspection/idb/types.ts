/**
 * Общие типы под-фичи «IndexedDB в редакторе состояния» (TASK-031, расширяет
 * TASK-017).
 *
 * Живут в `shared`, т.к. пересекают границу сред: поверхность (UI) шлёт запросы,
 * content-хост (`host.ts`, ISOLATED world) обходит `indexedDB` активной вкладки и
 * возвращает JSON-сериализуемые снимки. Значения IndexedDB — `structuredClone`-типы
 * (Blob/ArrayBuffer/Map/Set/Date/…), поэтому наружу идёт не сырое значение, а его
 * безопасное JSON-представление (`SafeJson`) с пометкой непереносимого/усечённого
 * (см. `logic.ts`).
 */

/**
 * JSON-безопасное представление произвольного значения IndexedDB. Непереносимые
 * типы (Blob, ArrayBuffer, Map, Set, Date, function, …) кодируются объектом-маркером
 * с зарезервированным ключом `@@qatb` (см. `toSafeJson`), поэтому дерево всегда
 * JSON-сериализуемо и не роняет панель.
 */
export type SafeJson =
  string | number | boolean | null | readonly SafeJson[] | { readonly [key: string]: SafeJson };

/**
 * Метаданные одного object store: ключ, автоинкремент, индексы, число записей.
 * Массивы не `readonly` — тип пересекает RPC-границу и должен совпадать с mutable-типом,
 * который выводит zod-схема ответа (`z.infer`).
 */
export interface IdbStoreInfo {
  readonly name: string;
  /** `keyPath` store: строка, массив строк (составной) или `null` (out-of-line ключ). */
  readonly keyPath: string | string[] | null;
  readonly autoIncrement: boolean;
  readonly indexes: string[];
  readonly count: number;
}

/** Снимок одной базы: имя, версия и метаданные её object stores. */
export interface IdbDatabaseSummary {
  readonly name: string;
  readonly version: number;
  readonly stores: IdbStoreInfo[];
}

/**
 * Одна запись object store в переносимом виде.
 * `keyText` — JSON-кодированный ключ для адресации при правке/удалении, либо `null`
 * (непереносимый ключ: Date/бинарный — строка только для показа, правка недоступна).
 */
export interface IdbRecord {
  readonly keyText: string | null;
  readonly keyDisplay: string;
  readonly value: SafeJson;
  /** Значение усечено при сериализации (бюджет/глубина/длина) — правка небезопасна. */
  readonly truncated: boolean;
}

/** Object store вместе с (объёмно-бюджетированным) набором записей — для снимка. */
export interface IdbStoreSnapshot extends IdbStoreInfo {
  readonly records: readonly IdbRecord[];
  readonly truncated: boolean;
}

/** База с полными снимками её stores. */
export interface IdbDatabaseSnapshot {
  readonly name: string;
  readonly version: number;
  readonly stores: readonly IdbStoreSnapshot[];
}

/** Полный снимок IndexedDB домена (экспорт JSON, объёмно-разумный). */
export interface IdbSnapshot {
  readonly origin: string;
  readonly databases: readonly IdbDatabaseSnapshot[];
}

/** Бюджет обхода курсором: максимум записей на один запрос store (перф/память). */
export const IDB_RECORD_BUDGET = 500;

/** Таймаут обхода курсором одного store, мс (защита от «зависших» баз). */
export const IDB_TIMEOUT_MS = 4000;

/** Максимальная длина строкового значения до усечения (символы). */
export const IDB_MAX_STRING = 8192;

/** Максимальная глубина рекурсии при сериализации значения. */
export const IDB_MAX_DEPTH = 8;

/** Бюджет узлов (полей/элементов) на одно значение при сериализации. */
export const IDB_MAX_NODES = 2000;

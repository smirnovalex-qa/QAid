/**
 * Общие типы под-фичи «Cache Storage в редакторе состояния» (TASK-031, расширяет
 * TASK-017).
 *
 * Живут в `shared`: поверхность (UI) шлёт запросы, content-хост (`host.ts`, ISOLATED
 * world) обходит `caches` активной вкладки и возвращает JSON-сериализуемые снимки
 * записей (запрос → метаданные ответа + тело при доступности). Правка тел ответов —
 * вне scope (это сетевой мок, TASK-022); здесь только чтение и удаление.
 */

/** Сводка одного именованного кэша: имя и число записей. */
export interface CacheSummary {
  readonly name: string;
  readonly count: number;
}

/** Одна запись кэша: запрос → метаданные ответа (+ тело при доступности). */
export interface CacheEntry {
  readonly reqUrl: string;
  readonly reqMethod: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  /** Тип ответа (`basic`/`cors`/`opaque`/…) — `opaque` скрывает тело/заголовки. */
  readonly responseType: string;
  readonly contentType: string | null;
  /**
   * Заголовки ответа как пары имя→значение (усечены по числу). Не `readonly` —
   * тип пересекает RPC-границу и должен совпадать с mutable-типом zod-схемы ответа.
   */
  readonly headers: [string, string][];
  /** Текст тела при доступности (текстовый тип, в пределах бюджета), иначе `null`. */
  readonly bodyText: string | null;
  readonly bodyTruncated: boolean;
  /** Причина отсутствия тела (`binary`/`too-large`/`opaque`/`empty`/`error`), либо `null`. */
  readonly bodyOmitted: string | null;
}

/** Снимок одного кэша со всеми (бюджетированными) записями. */
export interface CacheSnapshotCache {
  readonly name: string;
  readonly entries: readonly CacheEntry[];
  readonly truncated: boolean;
}

/** Полный снимок Cache Storage домена (экспорт JSON). */
export interface CacheSnapshot {
  readonly origin: string;
  readonly caches: readonly CacheSnapshotCache[];
}

/** Бюджет: максимум записей на один запрос кэша. */
export const CACHE_ENTRY_BUDGET = 500;

/** Таймаут обхода одного кэша, мс. */
export const CACHE_TIMEOUT_MS = 4000;

/** Максимальный размер тела ответа для чтения текста (байты/символы). */
export const CACHE_MAX_BODY = 65536;

/** Максимальное число заголовков в снимке одной записи. */
export const CACHE_MAX_HEADERS = 50;

/**
 * Чистая логика под-фичи «Cache Storage в редакторе состояния» (TASK-031).
 *
 * БЕЗ DOM и `chrome.*`: сериализация заголовков ответа, классификация тела (стоит ли
 * читать текст: текстовый ли тип, в пределах ли бюджета), усечение текста, zod-схемы
 * снимков и их сериализация/разбор. Почти-на-100% покрытый модуль (канон «core ~100%»).
 */
import { z } from 'zod';
import { CACHE_MAX_BODY, CACHE_MAX_HEADERS, type CacheEntry, type CacheSnapshot } from './types';

/** MIME-типы (и префиксы), тело которых безопасно показывать как текст. */
const TEXT_TYPE_PREFIXES = ['text/'];
const TEXT_TYPE_MATCHES = [
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/ecmascript',
  'image/svg+xml',
];
const TEXT_TYPE_SUFFIXES = ['+json', '+xml'];

/** true, если по `Content-Type` тело стоит трактовать как текст. */
export function isTextContentType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const ct = contentType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  if (ct === '') return false;
  if (TEXT_TYPE_PREFIXES.some((p) => ct.startsWith(p))) return true;
  if (TEXT_TYPE_MATCHES.includes(ct)) return true;
  return TEXT_TYPE_SUFFIXES.some((s) => ct.endsWith(s));
}

/** Итог решения о чтении тела: читать ли, и если нет — почему. */
export type BodyDecision =
  { readonly read: true } | { readonly read: false; readonly reason: string };

/**
 * Решает, читать ли тело ответа как текст. `opaque` (cross-origin no-cors) не даёт
 * доступа к телу/заголовкам; нетекстовый тип — бинарь; превышение `Content-Length`
 * бюджета — «слишком большое». Иначе — читаем.
 */
export function decideBody(input: {
  readonly responseType: string;
  readonly contentType: string | null;
  readonly contentLength: number | null;
  readonly maxBody?: number;
}): BodyDecision {
  const max = input.maxBody ?? CACHE_MAX_BODY;
  if (input.responseType === 'opaque' || input.responseType === 'opaqueredirect') {
    return { read: false, reason: 'opaque' };
  }
  if (input.contentLength !== null && input.contentLength > max) {
    return { read: false, reason: 'too-large' };
  }
  if (!isTextContentType(input.contentType)) {
    return { read: false, reason: 'binary' };
  }
  return { read: true };
}

/** Усекает текст до предела, помечая факт усечения. */
export function truncateText(
  text: string,
  max: number = CACHE_MAX_BODY,
): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}…`, truncated: true };
}

/** Сериализует заголовки (итератор пар) в отсортированный, усечённый по числу список. */
export function summarizeHeaders(
  headers: Iterable<readonly [string, string]>,
  max: number = CACHE_MAX_HEADERS,
): [string, string][] {
  const all = [...headers].map(([name, value]): [string, string] => [name, value]);
  all.sort((a, b) => a[0].localeCompare(b[0]));
  return all.slice(0, max);
}

// ── zod-схемы снимков ───────────────────────────────────────────────────────

/** Схема одной записи кэша. */
export const CacheEntrySchema = z.object({
  reqUrl: z.string(),
  reqMethod: z.string(),
  status: z.number().int(),
  statusText: z.string(),
  ok: z.boolean(),
  responseType: z.string(),
  contentType: z.string().nullable(),
  headers: z.array(z.tuple([z.string(), z.string()])),
  bodyText: z.string().nullable(),
  bodyTruncated: z.boolean(),
  bodyOmitted: z.string().nullable(),
});

/** Схема сводки кэша (имя + число записей). */
export const CacheSummarySchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
});

/** Схема снимка одного кэша с записями. */
export const CacheSnapshotCacheSchema = z.object({
  name: z.string(),
  entries: z.array(CacheEntrySchema),
  truncated: z.boolean(),
});

/** Схема полного снимка Cache Storage. */
export const CacheSnapshotSchema = z.object({
  origin: z.string(),
  caches: z.array(CacheSnapshotCacheSchema),
});

/** Сериализует снимок Cache Storage в человекочитаемый JSON. */
export function serializeSnapshot(snapshot: CacheSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/** Результат разбора внешнего снимка Cache Storage. */
export type ParseSnapshotResult =
  | { readonly ok: true; readonly value: CacheSnapshot }
  | { readonly ok: false; readonly error: string };

/** Разбирает JSON-текст снимка с zod-валидацией. Никогда не бросает. */
export function parseSnapshot(text: string): ParseSnapshotResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  const parsed = CacheSnapshotSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid-shape' };
  return { ok: true, value: parsed.data };
}

/** Хелпер сборки записи из уже прочитанных полей (используется хостом и тестами). */
export function buildEntry(input: {
  readonly reqUrl: string;
  readonly reqMethod: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly responseType: string;
  readonly contentType: string | null;
  readonly headers: [string, string][];
  readonly bodyText: string | null;
  readonly bodyTruncated: boolean;
  readonly bodyOmitted: string | null;
}): CacheEntry {
  return { ...input };
}

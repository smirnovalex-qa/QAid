/**
 * Content-хост Cache Storage (TASK-031): обходит и удаляет записи `caches` активной
 * вкладки в ISOLATED world по RPC `cache/*` (TASK-013).
 *
 * Живёт в `shared/inspection/cache` (а НЕ в `features/`): попадает в content-бандл,
 * который не должен импортировать фичи. Использует страничный глобал `caches`
 * (Cache Storage API) + `location`; `chrome.*`/preact/платформу не трогает — обмен
 * идёт через `registerHandler` шины. Свой роутер НЕ поднимает — его ставит инспекционный
 * host (проводка оркестратором в одном бандле).
 *
 * Тела ответов сериализуются устойчиво: только текстовые типы в пределах бюджета
 * читаются как текст; бинарь/opaque/крупные — помечаются причиной, а не роняют панель.
 *
 * Импорт `./messages` (side-effect) кладёт zod-схемы `cache/*` в реестр content-реалма.
 */
import './messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf } from '@/shared/messaging/contract';
import { AppErrorException, appError } from '@/shared/errors';
import { buildEntry, decideBody, summarizeHeaders, truncateText } from './logic';
import { CACHE_ENTRY_BUDGET, CACHE_MAX_BODY, CACHE_TIMEOUT_MS } from './types';
import type { CacheEntry, CacheSummary } from './types';

/** Возвращает страничный `caches` либо бросает типизированную ошибку недоступности. */
function requireCaches(): CacheStorage {
  const store = (globalThis as { caches?: CacheStorage }).caches;
  if (store === undefined) {
    throw new AppErrorException(
      appError('INTERNAL', 'CacheStorage unavailable', undefined, 'cache.error.unavailable'),
    );
  }
  return store;
}

/** Origin вкладки для отображения (пустая строка, если недоступен). */
function pageOrigin(): string {
  return (globalThis as { location?: { origin?: string } }).location?.origin ?? '';
}

/** Читает целочисленный `Content-Length`, либо `null` если отсутствует/некорректен. */
function contentLength(headers: Headers): number | null {
  const raw = headers.get('content-length');
  if (raw === null) return null;
  const num = Number.parseInt(raw, 10);
  return Number.isFinite(num) ? num : null;
}

/** Строит переносимую запись из запроса и (возможно отсутствующего) ответа. */
async function toEntry(request: Request, response: Response | undefined): Promise<CacheEntry> {
  const base = { reqUrl: request.url, reqMethod: request.method };
  if (response === undefined) {
    return buildEntry({
      ...base,
      status: 0,
      statusText: '',
      ok: false,
      responseType: 'none',
      contentType: null,
      headers: [],
      bodyText: null,
      bodyTruncated: false,
      bodyOmitted: 'error',
    });
  }

  const contentType = response.headers.get('content-type');
  const headers = summarizeHeaders(response.headers as Iterable<[string, string]>);
  const meta = {
    ...base,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    responseType: response.type,
    contentType,
    headers,
  };

  const decision = decideBody({
    responseType: response.type,
    contentType,
    contentLength: contentLength(response.headers),
  });
  if (!decision.read) {
    return buildEntry({
      ...meta,
      bodyText: null,
      bodyTruncated: false,
      bodyOmitted: decision.reason,
    });
  }

  try {
    const raw = await response.clone().text();
    if (raw === '') {
      return buildEntry({ ...meta, bodyText: null, bodyTruncated: false, bodyOmitted: 'empty' });
    }
    const { text, truncated } = truncateText(raw, CACHE_MAX_BODY);
    return buildEntry({ ...meta, bodyText: text, bodyTruncated: truncated, bodyOmitted: null });
  } catch {
    return buildEntry({ ...meta, bodyText: null, bodyTruncated: false, bodyOmitted: 'error' });
  }
}

// ── хендлеры RPC ────────────────────────────────────────────────────────────

async function list(): Promise<{ caches: CacheSummary[]; origin: string }> {
  const store = requireCaches();
  const names = await store.keys();
  const summaries: CacheSummary[] = [];
  for (const name of names) {
    try {
      const cache = await store.open(name);
      const requests = await cache.keys();
      summaries.push({ name, count: requests.length });
    } catch {
      summaries.push({ name, count: 0 });
    }
  }
  return { caches: summaries, origin: pageOrigin() };
}

async function get(
  req: RequestOf<'cache/get'>,
): Promise<{ entries: CacheEntry[]; truncated: boolean }> {
  const store = requireCaches();
  const cache = await store.open(req.cache);
  const requests = await cache.keys();
  const limit = req.limit ?? CACHE_ENTRY_BUDGET;
  const deadline = Date.now() + CACHE_TIMEOUT_MS;
  const entries: CacheEntry[] = [];
  let truncated = false;
  for (const request of requests) {
    if (entries.length >= limit || Date.now() > deadline) {
      truncated = true;
      break;
    }
    const response = await cache.match(request);
    entries.push(await toEntry(request, response));
  }
  return { entries, truncated };
}

async function remove(req: RequestOf<'cache/remove'>): Promise<{ ok: boolean }> {
  const store = requireCaches();
  const cache = await store.open(req.cache);
  const ok = await cache.delete(req.reqUrl);
  return { ok };
}

async function clear(req: RequestOf<'cache/clear'>): Promise<{ removed: number }> {
  const store = requireCaches();

  /** Число записей одного кэша (для отчёта; ошибка → 0). */
  const countCache = async (name: string): Promise<number> => {
    try {
      const cache = await store.open(name);
      return (await cache.keys()).length;
    } catch {
      return 0;
    }
  };

  if (req.cache === undefined) {
    const names = await store.keys();
    let removed = 0;
    for (const name of names) {
      removed += await countCache(name);
      await store.delete(name);
    }
    return { removed };
  }

  const removed = await countCache(req.cache);
  await store.delete(req.cache);
  return { removed };
}

/**
 * Хендлеры Cache Storage. Экспортируются для прямого юнит-тестирования (через инъекцию
 * фейкового `caches` в глобал): те же функции регистрируются в шине из
 * `installCacheContentHost`.
 */
export const cacheHandlers = { list, get, remove, clear };

/** Идемпотентность: шина не умеет разрегистрировать хендлеры — защита от повтора. */
let installed = false;

/** Регистрирует хендлеры `cache/*` в шине content-реалма. Идемпотентно. */
export function installCacheContentHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('cache/list', list);
  registerHandler('cache/get', get);
  registerHandler('cache/remove', remove);
  registerHandler('cache/clear', clear);
}

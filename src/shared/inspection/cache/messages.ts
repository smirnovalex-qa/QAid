/**
 * RPC-контракты «Cache Storage в редакторе состояния» (TASK-031) поверх федеративного
 * протокола (ADR-0010/0012). Все запросы адресованы `content` (по канону web storage
 * из TASK-017): background генерически форвардит их в целевую вкладку, гарантируя
 * инъекцию content-хоста (`installCacheContentHost`). Каждый несёт `tabId`.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import { CacheEntrySchema, CacheSummarySchema } from './logic';

/** База запроса к content: обязательный адрес вкладки. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/** `cache/list` — все кэши домена (`caches.keys()`) + число записей + `origin`. */
export const CacheList = defineMessage(
  'cache/list',
  TabTarget,
  z.object({ caches: z.array(CacheSummarySchema), origin: z.string() }),
  { target: 'content' },
);

/** `cache/get` — записи одного кэша (запрос → метаданные ответа/тело) с бюджетом. */
export const CacheGet = defineMessage(
  'cache/get',
  TabTarget.extend({ cache: z.string(), limit: z.number().int().positive().optional() }),
  z.object({ entries: z.array(CacheEntrySchema), truncated: z.boolean() }),
  { target: 'content' },
);

/** `cache/remove` — удалить одну запись кэша по URL запроса. */
export const CacheRemove = defineMessage(
  'cache/remove',
  TabTarget.extend({ cache: z.string(), reqUrl: z.string() }),
  z.object({ ok: z.boolean() }),
  { target: 'content' },
);

/**
 * `cache/clear` — очистка: с `cache` → удалить этот кэш; без него → удалить ВСЕ кэши
 * домена (быстрая очистка). Ответ — число затронутых записей (для отчёта).
 */
export const CacheClear = defineMessage(
  'cache/clear',
  TabTarget.extend({ cache: z.string().optional() }),
  z.object({ removed: z.number().int().nonnegative() }),
  { target: 'content' },
);

/** Контракты Cache Storage (content) — регистрируются в content-хосте. */
export const cacheMessages = [CacheList, CacheGet, CacheRemove, CacheClear];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'cache/list': {
      request: z.infer<typeof CacheList.request>;
      response: z.infer<typeof CacheList.response>;
    };
    'cache/get': {
      request: z.infer<typeof CacheGet.request>;
      response: z.infer<typeof CacheGet.response>;
    };
    'cache/remove': {
      request: z.infer<typeof CacheRemove.request>;
      response: z.infer<typeof CacheRemove.response>;
    };
    'cache/clear': {
      request: z.infer<typeof CacheClear.request>;
      response: z.infer<typeof CacheClear.response>;
    };
  }
}

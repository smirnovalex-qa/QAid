/**
 * RPC-контракты «IndexedDB в редакторе состояния» (TASK-031) поверх федеративного
 * протокола (ADR-0010/0012). Все запросы адресованы `content` (по канону web storage
 * из TASK-017): background не держит доменных хендлеров, а генерически форвардит их в
 * целевую вкладку, гарантируя инъекцию content-хоста (`installIdbContentHost`).
 *
 * Каждый несёт `tabId` — адрес форварда. Валидация zod — на обеих границах (UI и content).
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import { IdbDatabaseSummarySchema, IdbRecordSchema, IdbStoreInfoSchema } from './logic';

/** База запроса к content: обязательный адрес вкладки. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/** `idb/list` — все базы домена с метаданными их object stores + `origin` вкладки. */
export const IdbList = defineMessage(
  'idb/list',
  TabTarget,
  z.object({ databases: z.array(IdbDatabaseSummarySchema), origin: z.string() }),
  { target: 'content' },
);

/** `idb/get` — записи store (курсор с бюджетом) + актуальные метаданные store. */
export const IdbGet = defineMessage(
  'idb/get',
  TabTarget.extend({
    db: z.string(),
    store: z.string(),
    limit: z.number().int().positive().optional(),
  }),
  z.object({
    records: z.array(IdbRecordSchema),
    truncated: z.boolean(),
    store: IdbStoreInfoSchema,
  }),
  { target: 'content' },
);

/**
 * `idb/set` — записать/перезаписать запись (`put`). Для in-line ключа (`keyPath`) ключ
 * берётся из значения; для out-of-line — из `key` (JSON-кодированный). `value` —
 * JSON-текст значения.
 */
export const IdbSet = defineMessage(
  'idb/set',
  TabTarget.extend({
    db: z.string(),
    store: z.string(),
    key: z.string().optional(),
    value: z.string(),
  }),
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/** `idb/remove` — удалить запись по JSON-кодированному ключу. */
export const IdbRemove = defineMessage(
  'idb/remove',
  TabTarget.extend({ db: z.string(), store: z.string(), key: z.string() }),
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/**
 * `idb/clear` — очистка с тремя уровнями: `db`+`store` → очистить store; только `db`
 * → удалить базу; ни того ни другого → удалить ВСЕ базы домена (быстрая очистка).
 * Ответ — число затронутых записей (для отчёта).
 */
export const IdbClear = defineMessage(
  'idb/clear',
  TabTarget.extend({ db: z.string().optional(), store: z.string().optional() }),
  z.object({ removed: z.number().int().nonnegative() }),
  { target: 'content' },
);

/** Контракты IndexedDB (content) — регистрируются в content-хосте. */
export const idbMessages = [IdbList, IdbGet, IdbSet, IdbRemove, IdbClear];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'idb/list': {
      request: z.infer<typeof IdbList.request>;
      response: z.infer<typeof IdbList.response>;
    };
    'idb/get': {
      request: z.infer<typeof IdbGet.request>;
      response: z.infer<typeof IdbGet.response>;
    };
    'idb/set': {
      request: z.infer<typeof IdbSet.request>;
      response: z.infer<typeof IdbSet.response>;
    };
    'idb/remove': {
      request: z.infer<typeof IdbRemove.request>;
      response: z.infer<typeof IdbRemove.response>;
    };
    'idb/clear': {
      request: z.infer<typeof IdbClear.request>;
      response: z.infer<typeof IdbClear.response>;
    };
  }
}

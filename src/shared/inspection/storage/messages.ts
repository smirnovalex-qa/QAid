/**
 * RPC-контракты фичи «Состояние браузера» (TASK-017) поверх федеративного протокола
 * (ADR-0010/0012). Два адресата:
 *
 *  - `web storage` (`target: 'content'`) — читают/пишут `localStorage`/`sessionStorage`
 *    активной вкладки в ISOLATED world; background генерически форвардит их в вкладку,
 *    гарантируя инъекцию (как инспекционный слой). Каждый несёт `tabId` — адрес форварда.
 *  - `cookies` (default `target: 'background'`) — обрабатываются доменными
 *    background-хендлерами поверх платформенного seam `cookies` + `tabs.getUrl`
 *    (прямой `chrome.cookies` запрещён вне платформы).
 *
 * Валидация zod — на обеих границах (UI и content/background).
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import { CookieRecordSchema } from './logic';

/** База запроса к content: обязательный адрес вкладки + область web storage. */
const AreaTarget = z.object({
  tabId: z.number().int().nonnegative(),
  area: z.enum(['local', 'session']),
});

/** База запроса к background: обязательный адрес вкладки. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

// ── web storage (content-target) ─────────────────────────────────────────────

/** `storage/list` — все пары ключ→значение области + `origin` вкладки. */
export const StorageList = defineMessage(
  'storage/list',
  AreaTarget,
  z.object({
    items: z.array(z.object({ key: z.string(), value: z.string() })),
    origin: z.string(),
  }),
  { target: 'content' },
);

/** `storage/set` — записать/перезаписать значение по ключу. */
export const StorageSet = defineMessage(
  'storage/set',
  AreaTarget.extend({ key: z.string(), value: z.string() }),
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/** `storage/remove` — удалить один ключ. */
export const StorageRemove = defineMessage(
  'storage/remove',
  AreaTarget.extend({ key: z.string() }),
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/** `storage/clear` — очистить область; ответ — число удалённых записей. */
export const StorageClear = defineMessage(
  'storage/clear',
  AreaTarget,
  z.object({ removed: z.number().int().nonnegative() }),
  { target: 'content' },
);

// ── cookies (background-target) ──────────────────────────────────────────────

/** `cookies/list` — cookies домена вкладки + сам домен (для отображения). */
export const CookiesList = defineMessage(
  'cookies/list',
  TabTarget,
  z.object({ cookies: z.array(CookieRecordSchema), domain: z.string() }),
);

/** `cookies/set` — записать/перезаписать cookie (background собирает `url`). */
export const CookiesSet = defineMessage(
  'cookies/set',
  TabTarget.extend({ cookie: CookieRecordSchema }),
  z.object({ ok: z.boolean() }),
);

/** `cookies/remove` — удалить cookie по имени (+ опционально домен/путь). */
export const CookiesRemove = defineMessage(
  'cookies/remove',
  TabTarget.extend({
    name: z.string(),
    domain: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({ ok: z.boolean() }),
);

/** `cookies/clear` — удалить все cookies домена; ответ — число удалённых. */
export const CookiesClear = defineMessage(
  'cookies/clear',
  TabTarget,
  z.object({ removed: z.number().int().nonnegative() }),
);

/** Контракты web storage (content) — регистрируются в content-хосте. */
export const webStorageMessages = [StorageList, StorageSet, StorageRemove, StorageClear];

/** Контракты cookies (background) — обрабатываются доменными хендлерами. */
export const cookieMessages = [CookiesList, CookiesSet, CookiesRemove, CookiesClear];

/** Все контракты фичи — для регистрации в дескрипторе (`FeatureModule.messages`). */
export const storageEditorMessages = [...webStorageMessages, ...cookieMessages];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'storage/list': {
      request: z.infer<typeof StorageList.request>;
      response: z.infer<typeof StorageList.response>;
    };
    'storage/set': {
      request: z.infer<typeof StorageSet.request>;
      response: z.infer<typeof StorageSet.response>;
    };
    'storage/remove': {
      request: z.infer<typeof StorageRemove.request>;
      response: z.infer<typeof StorageRemove.response>;
    };
    'storage/clear': {
      request: z.infer<typeof StorageClear.request>;
      response: z.infer<typeof StorageClear.response>;
    };
    'cookies/list': {
      request: z.infer<typeof CookiesList.request>;
      response: z.infer<typeof CookiesList.response>;
    };
    'cookies/set': {
      request: z.infer<typeof CookiesSet.request>;
      response: z.infer<typeof CookiesSet.response>;
    };
    'cookies/remove': {
      request: z.infer<typeof CookiesRemove.request>;
      response: z.infer<typeof CookiesRemove.response>;
    };
    'cookies/clear': {
      request: z.infer<typeof CookiesClear.request>;
      response: z.infer<typeof CookiesClear.response>;
    };
  }
}

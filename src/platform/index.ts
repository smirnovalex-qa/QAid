/**
 * Адаптер платформы — единственная точка доступа к WebExtensions API (ADR-0014).
 *
 * Ре-экспортирует promise-based `browser` из `webextension-polyfill` (работает в
 * Chrome и Firefox). Прямое обращение к `chrome.*` / `browser.*` вне этого модуля
 * и тонких транспортов `shared/messaging/transports.ts` запрещено ESLint.
 */
import browser from 'webextension-polyfill';

export { browser };

/** Тип платформенного API (форма объекта `browser`). */
export type Browser = typeof browser;

/**
 * `chrome.sidePanel` — Chrome-only API, отсутствующий в типах webextension-polyfill.
 * Тонкая типизированная обёртка (типы берутся из `@types/chrome`), чтобы доступ к
 * платформе оставался в одном месте, а surface-код не трогал `chrome.*` напрямую.
 */
export const sidePanel = {
  setPanelBehavior: (behavior: chrome.sidePanel.PanelBehavior): Promise<void> =>
    chrome.sidePanel.setPanelBehavior(behavior),
  open: (options: chrome.sidePanel.OpenOptions): Promise<void> => chrome.sidePanel.open(options),
};

/**
 * Тонкий promise-обёртка над `chrome.storage.local` (в MV3 API уже promise-based).
 * Достаточно для персиста лёгких UI-настроек (напр. тема); полноценный
 * версионируемый storage-слой с неймспейсингом/миграциями — в TASK-005.
 */
export const storageLocal = {
  get: <T extends Record<string, unknown>>(defaults: T): Promise<T> =>
    chrome.storage.local.get(defaults),
  set: (items: Record<string, unknown>): Promise<void> => chrome.storage.local.set(items),
};

/**
 * Optional-permissions (ADR-0013, least-privilege в рантайме). Форма аргумента
 * выводится из платформенного API, чтобы `origins`/`permissions` совпадали с
 * ожиданиями браузера без ручного дублирования литеральных union'ов.
 *
 * `request` **обязан** вызываться из обработчика пользовательского жеста
 * (поверхность popup/side panel), иначе браузер отклонит запрос. Реализация
 * брокера — в `shared/permissions.ts`.
 */
export type PermissionSpec = Parameters<typeof browser.permissions.request>[0];

/**
 * Все обращения к `browser.permissions.*` — ленивые (внутри функций), чтобы
 * загрузка модуля платформы не трогала `chrome.permissions` (иначе среды без
 * этого namespace, напр. тестовый мок без прав, падали бы на импорте).
 */
export const permissions = {
  request: (spec: PermissionSpec): Promise<boolean> => browser.permissions.request(spec),
  contains: (spec: PermissionSpec): Promise<boolean> => browser.permissions.contains(spec),
  onAdded: {
    addListener: (cb: () => void): void => {
      browser.permissions.onAdded.addListener(cb);
    },
    removeListener: (cb: () => void): void => {
      browser.permissions.onAdded.removeListener(cb);
    },
  },
  onRemoved: {
    addListener: (cb: () => void): void => {
      browser.permissions.onRemoved.addListener(cb);
    },
    removeListener: (cb: () => void): void => {
      browser.permissions.onRemoved.removeListener(cb);
    },
  },
};

/**
 * `chrome.scripting` — программная инъекция по требованию (вместо статических
 * `content_scripts`, ADR-0020). Используется менеджером инъекции в background.
 */
export type ScriptInjection = Parameters<typeof browser.scripting.executeScript>[0];

export const scripting = {
  executeScript: (injection: ScriptInjection): Promise<unknown> =>
    browser.scripting.executeScript(injection),
};

/**
 * `chrome.tabs` — минимальный доступ к вкладкам. `queryActive` возвращает id
 * активной вкладки текущего окна (id доступен без права `tabs`; url/title — нет,
 * они здесь и не нужны). Нужен поверхности, чтобы адресовать инспекционный RPC.
 *
 * `getUrl` возвращает URL вкладки: доступен без права `tabs`, когда у расширения
 * есть постоянный optional host-доступ ко всем http/https-origin (ADR-0022). Нужен
 * фиче cookies (TASK-017), чтобы собрать корректный `url` для `chrome.cookies`.
 */
export const tabs = {
  queryActive: async (): Promise<number | undefined> => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  },
  getUrl: async (tabId: number): Promise<string | undefined> => {
    const tab = await browser.tabs.get(tabId);
    return tab.url;
  },
  /**
   * Навигация вкладки на новый URL (эмуляция окружения, TASK-019: применение
   * query-профиля). Не требует права `tabs`, когда есть host-доступ к origin.
   */
  navigate: async (tabId: number, url: string): Promise<void> => {
    await browser.tabs.update(tabId, { url });
  },
  /**
   * Открывает новую вкладку на `url` и возвращает её id (TASK-037: вкладка-праймер
   * микрофона — единственная поверхность, где надёжно показывается промпт
   * `getUserMedia`). Создание вкладки права `tabs` не требует.
   */
  create: async (options: { url: string; active?: boolean }): Promise<number | undefined> => {
    const tab = await browser.tabs.create({ url: options.url, active: options.active ?? true });
    return tab.id;
  },
  /** Закрывает вкладку по id (best-effort teardown вкладки-праймера). */
  remove: async (tabId: number): Promise<void> => {
    await browser.tabs.remove(tabId);
  },
  /**
   * Перезагружает вкладку (профили сессий, TASK-047: обязательный шаг hot-swap —
   * приложение/SPA перечитывает cookies и web storage только при загрузке
   * документа, иначе после подмены остаётся смесь старой и новой сессии).
   * `bypassCache: false` — обычная перезагрузка (кэш действителен, меняем только
   * состояние авторизации). Права `tabs` не требует при host-доступе к origin.
   */
  reload: async (tabId: number): Promise<void> => {
    await browser.tabs.reload(tabId, { bypassCache: false });
  },
};

/**
 * События жизненного цикла вкладок (TASK-019). Нужны фоновому оркестратору
 * эмуляции: при навигации вкладки с активной эмуляцией MAIN-world оверрайды
 * пропадают (инъекция не переживает загрузку документа) — их надо инъектировать
 * заново; при закрытии вкладки — снять DNR-правила и забыть её из реестра.
 * Сигнатуры слушателей выводятся из платформенного API (без дублирования union'ов).
 */
export type TabUpdatedListener = Parameters<typeof browser.tabs.onUpdated.addListener>[0];
export type TabRemovedListener = Parameters<typeof browser.tabs.onRemoved.addListener>[0];

export const tabEvents = {
  onUpdated: {
    addListener: (cb: TabUpdatedListener): void => {
      browser.tabs.onUpdated.addListener(cb);
    },
    removeListener: (cb: TabUpdatedListener): void => {
      browser.tabs.onUpdated.removeListener(cb);
    },
  },
  onRemoved: {
    addListener: (cb: TabRemovedListener): void => {
      browser.tabs.onRemoved.addListener(cb);
    },
    removeListener: (cb: TabRemovedListener): void => {
      browser.tabs.onRemoved.removeListener(cb);
    },
  },
};

/**
 * `chrome.declarativeNetRequest` — session-scoped правила подмены заголовков
 * запроса (TASK-019: `User-Agent`/`Accept-Language`). Session-rules эфемерны
 * (сбрасываются при перезапуске SW) и ограничены вкладкой — least-privilege, без
 * персистентных правил. Право `declarativeNetRequest` (+ host) запрашивается
 * брокером под жестом. Типы — из `@types/chrome` (как `sidePanel`), т.к.
 * webextension-polyfill не покрывает DNR-namespace полностью.
 */
export type DnrUpdateOptions = chrome.declarativeNetRequest.UpdateRuleOptions;

export const declarativeNetRequest = {
  updateSessionRules: (options: DnrUpdateOptions): Promise<void> =>
    chrome.declarativeNetRequest.updateSessionRules(options),
  getSessionRules: (): Promise<chrome.declarativeNetRequest.Rule[]> =>
    chrome.declarativeNetRequest.getSessionRules(),
};

/**
 * MAIN-world инъекция функции (TASK-019). В отличие от инспекционного хоста
 * (ISOLATED, `executeScript({ files })`), оверрайды окружения обязаны жить в
 * MAIN-world, чтобы видеть настоящие `navigator`/`Intl`/`geolocation` страницы.
 * Передаём чистую самодостаточную функцию + сериализуемые аргументы (Chrome
 * сериализует `func.toString()`); `injectImmediately` — для ре-инъекции при
 * навигации (успеть до скриптов страницы). `chrome.scripting` (не polyfill) —
 * его типы поддерживают `world`/`func`/`args`.
 */
export const scriptingMain = {
  run: <Args extends unknown[]>(
    tabId: number,
    func: (...args: Args) => void,
    args: Args,
    injectImmediately = false,
  ): Promise<unknown> =>
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args,
      injectImmediately,
    }),
};

/**
 * `chrome.tabs.captureVisibleTab` — снимок видимой области активной вкладки текущего
 * окна (TASK-027, скриншот). Доступен при host-доступе к origin вкладки (или
 * `activeTab`); право запрашивается брокером под жестом. Возвращает data-URL кадра.
 * Типы — из `@types/chrome` (как `sidePanel`/DNR): опции формата/качества у polyfill
 * покрыты не полностью, а seam должен быть единственной точкой доступа к платформе.
 */
export type CaptureOptions = chrome.tabs.CaptureVisibleTabOptions;

export const capture = {
  visibleTab: (options?: CaptureOptions): Promise<string> =>
    chrome.tabs.captureVisibleTab(options ?? {}),
};

/**
 * `chrome.storage.sync` — синк выбранных пространств настроек между устройствами
 * пользователя (TASK-029) поверх аккаунта браузера, без собственного бэкенда. Квоты
 * малы (`QUOTA_BYTES` ~100KB, `QUOTA_BYTES_PER_ITEM` ~8KB, `MAX_ITEMS` ~512) —
 * фича проектируется под них. Как и весь платформенный слой (ADR-0014), это
 * единственная точка доступа.
 *
 * Экспорт — `StorageSyncSeam | undefined`: если `chrome.storage.sync` в среде
 * отсутствует (напр. jsdom-тесты без мока, старый браузер), значение === `undefined`,
 * и фича грациозно деградирует (`isAvailable() === false`), а не падает. Квоты
 * снимаются один раз при загрузке (в реальном расширении API всегда доступен).
 */
export type StorageSyncChange = Record<string, { oldValue?: unknown; newValue?: unknown }>;
export type StorageSyncListener = (changes: StorageSyncChange) => void;

export interface StorageSyncSeam {
  get(keys?: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  getBytesInUse(keys?: string[] | null): Promise<number>;
  readonly onChanged: {
    addListener(cb: StorageSyncListener): void;
    removeListener(cb: StorageSyncListener): void;
  };
  readonly QUOTA_BYTES: number;
  readonly QUOTA_BYTES_PER_ITEM: number;
  readonly MAX_ITEMS: number;
}

/** Достаёт `chrome.storage.sync` устойчиво к его отсутствию (jsdom/старый браузер). */
function resolveSyncArea(): chrome.storage.SyncStorageArea | undefined {
  try {
    return chrome.storage.sync;
  } catch {
    return undefined;
  }
}

const syncArea = resolveSyncArea();

export const storageSync: StorageSyncSeam | undefined = syncArea
  ? {
      get: (keys?: string[] | null): Promise<Record<string, unknown>> => syncArea.get(keys ?? null),
      set: (items: Record<string, unknown>): Promise<void> => syncArea.set(items),
      remove: (keys: string[]): Promise<void> => syncArea.remove(keys),
      getBytesInUse: (keys?: string[] | null): Promise<number> =>
        syncArea.getBytesInUse(keys ?? null),
      onChanged: {
        addListener: (cb: StorageSyncListener): void => {
          syncArea.onChanged.addListener(cb);
        },
        removeListener: (cb: StorageSyncListener): void => {
          syncArea.onChanged.removeListener(cb);
        },
      },
      QUOTA_BYTES: syncArea.QUOTA_BYTES,
      QUOTA_BYTES_PER_ITEM: syncArea.QUOTA_BYTES_PER_ITEM,
      MAX_ITEMS: syncArea.MAX_ITEMS,
    }
  : undefined;

/**
 * `chrome.debugger` — CDP-транспорт перехвата мока сети (TASK-032, второй транспорт
 * поверх того же движка правил). Даёт перехват через протокол отладки (`Fetch`
 * domain), ловящий запросы в обход MAIN-обёрток (воркеры, `sendBeacon`, ресурсы) и
 * при строгом CSP — ценой баннера отладки, поэтому режим строго opt-in.
 *
 * **Право `debugger` — install-time, а НЕ optional.** Chrome ЗАПРЕЩАЕТ перечислять
 * `debugger` в `optional_permissions` (наравне с `declarativeNetRequest`,
 * `geolocation` и др.): рантайм-`permissions.request` его отвергает. Поэтому право
 * декларируется в манифесте (`permissions`), а opt-in обеспечивается на уровне
 * действия: отладчик подключается только по жесту пользователя при выборе CDP-режима
 * и снимается во всех ветках (ADR-0038). Это тот же компромисс, что уже принят для
 * DNR (ADR-0026): API-право install-time, но наблюдаемый эффект — только под жестом.
 *
 * Все обращения к `chrome.debugger.*` — ленивые (внутри функций), чтобы загрузка
 * модуля платформы не трогала namespace (среды без него, напр. тестовый мок, не
 * падали бы на импорте). Типы — из `@types/chrome` (как `sidePanel`/DNR), т.к.
 * webextension-polyfill не покрывает `debugger`. Тонкие обёртки: attach/detach по
 * `tabId`, `sendCommand` (CDP-метод + params), события `onEvent`/`onDetach`.
 */
export type Debuggee = chrome.debugger.Debuggee;
// `params` — `unknown`, а не `object`: CDP-события несут `Object` (напр.
// `Fetch.requestPaused`), а `Object` не присваивается `object` при strictFunctionTypes;
// потребитель приводит к конкретной форме события. `unknown` безопасен и без `Object`.
export type DebuggerEventListener = (
  source: chrome.debugger.Debuggee,
  method: string,
  params?: unknown,
) => void;
export type DebuggerDetachListener = (source: chrome.debugger.Debuggee, reason: string) => void;

/** Версия remote-debugging протокола, к которой прикрепляемся (CDP 1.3, Fetch domain). */
const CDP_PROTOCOL_VERSION = '1.3';

export interface DebuggerSeam {
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  sendCommand(tabId: number, method: string, params?: object): Promise<unknown>;
  readonly onEvent: {
    addListener(cb: DebuggerEventListener): void;
    removeListener(cb: DebuggerEventListener): void;
  };
  readonly onDetach: {
    addListener(cb: DebuggerDetachListener): void;
    removeListener(cb: DebuggerDetachListener): void;
  };
}

export const debuggerSeam: DebuggerSeam = {
  attach: (tabId: number): Promise<void> => chrome.debugger.attach({ tabId }, CDP_PROTOCOL_VERSION),
  detach: (tabId: number): Promise<void> => chrome.debugger.detach({ tabId }),
  sendCommand: (tabId: number, method: string, params?: object): Promise<unknown> =>
    chrome.debugger.sendCommand({ tabId }, method, params),
  onEvent: {
    addListener: (cb: DebuggerEventListener): void => {
      chrome.debugger.onEvent.addListener(cb);
    },
    removeListener: (cb: DebuggerEventListener): void => {
      chrome.debugger.onEvent.removeListener(cb);
    },
  },
  onDetach: {
    addListener: (cb: DebuggerDetachListener): void => {
      chrome.debugger.onDetach.addListener(cb);
    },
    removeListener: (cb: DebuggerDetachListener): void => {
      chrome.debugger.onDetach.removeListener(cb);
    },
  },
};

/**
 * `browser.cookies` — чтение/запись/удаление cookies (TASK-017). Право `cookies`
 * (+ host к origin вкладки) запрашивается брокером по требованию, а не при установке
 * (least-privilege, ADR-0013). Как и весь платформенный слой (ADR-0014), это
 * единственная точка доступа к `browser.*`; доменная обёртка над cookies живёт в
 * shared и ходит только через этот seam.
 */
export type CookieGetAllDetails = Parameters<typeof browser.cookies.getAll>[0];
export type CookieSetDetails = Parameters<typeof browser.cookies.set>[0];
export type CookieRemoveDetails = Parameters<typeof browser.cookies.remove>[0];

export const cookies = {
  getAll: (details: CookieGetAllDetails): ReturnType<typeof browser.cookies.getAll> =>
    browser.cookies.getAll(details),
  set: (details: CookieSetDetails): ReturnType<typeof browser.cookies.set> =>
    browser.cookies.set(details),
  remove: (details: CookieRemoveDetails): ReturnType<typeof browser.cookies.remove> =>
    browser.cookies.remove(details),
};

/**
 * `chrome.offscreen` (TASK-037) — единственный offscreen-документ для `MediaRecorder`
 * (в service worker его нет). `ensure` идемпотентен: если документ уже существует,
 * повторный `createDocument` бросает — ловим и считаем это успехом (единственный
 * экземпляр). `close` — best-effort (закрытие несуществующего документа не критично).
 * Наличие определяем через `runtime.getContexts` (устойчивее, чем `hasDocument`,
 * покрытие которого зависит от версии Chrome). Типы — из `@types/chrome`.
 */
export type OffscreenReason =
  'USER_MEDIA' | 'DISPLAY_MEDIA' | 'DOM_PARSER' | 'WEB_RTC' | 'CLIPBOARD' | 'BLOBS';

/**
 * Доменные опции создания offscreen-документа. Union `OffscreenReason` (а не
 * `chrome.offscreen.Reason`) держит `chrome.*` внутри платформы: доменный код
 * передаёт строковые литералы, не называя namespace (ADR-0014). Enum `Reason`
 * строково-значный, поэтому приведение внутри seam безопасно.
 */
export interface OffscreenCreateOptions {
  url: string;
  reasons: OffscreenReason[];
  justification: string;
}

export const offscreen = {
  hasDocument: async (): Promise<boolean> => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    return contexts.length > 0;
  },
  ensure: async (options: OffscreenCreateOptions): Promise<void> => {
    if (await offscreen.hasDocument()) return;
    try {
      await chrome.offscreen.createDocument({
        url: options.url,
        justification: options.justification,
        reasons: options.reasons as unknown as chrome.offscreen.Reason[],
      });
    } catch (error) {
      // Гонка «создан параллельно»: если документ уже есть — это успех, иначе пробрасываем.
      if (await offscreen.hasDocument()) return;
      throw error instanceof Error ? error : new Error(String(error));
    }
  },
  close: async (): Promise<void> => {
    if (!(await offscreen.hasDocument())) return;
    await chrome.offscreen.closeDocument();
  },
};

/**
 * `chrome.action` — бейдж-индикатор на иконке расширения (TASK-037: «идёт запись»).
 * Единственная точка доступа к платформе (ADR-0014). MV3 `chrome.action` —
 * promise-based; типы — из `@types/chrome`.
 */
export const action = {
  setBadgeText: (details: chrome.action.BadgeTextDetails): Promise<void> =>
    chrome.action.setBadgeText(details),
  setBadgeBackgroundColor: (details: chrome.action.BadgeColorDetails): Promise<void> =>
    chrome.action.setBadgeBackgroundColor(details),
};

/**
 * `runtime.getURL` — резолвит упакованный ресурс расширения в абсолютный URL
 * (TASK-037: путь offscreen-документа для `chrome.offscreen.createDocument`).
 * Единственная точка доступа к платформе (ADR-0014): доменный код не трогает
 * `chrome.*`/`browser.*` напрямую.
 */
export const runtime = {
  getURL: (path: string): string => browser.runtime.getURL(path),
};

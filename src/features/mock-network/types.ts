/**
 * Типы фичи «Мок сети» (TASK-022, R2 — ядро ценности). Живут отдельно от zod-схем
 * (`rules.ts`/`messages.ts`), чтобы чистая `logic.ts` и MAIN-перехватчик
 * (`./interceptor`) зависели только от формы данных, а не от zod.
 *
 * Граница сред: UI/настройки хранят «сырые» правила (`MockRule`), background
 * компилирует их в сериализуемый `CompiledRule` (regex как source+flags — функции
 * через границу инъекции не ходят) и передаёт перехватчику. Пойманные запросы
 * возвращаются в UI как `CaughtRequest` (снимок, без живых объектов Response/XHR).
 */

/** HTTP-методы, по которым матчим. Пустой список в matcher = «любой метод». */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

/** Вид URL-паттерна: glob (`*`/`?`) компилируется в безопасный regex, либо сырой regex. */
export type PatternKind = 'glob' | 'regex';

/** Операция над одним заголовком ответа. */
export interface HeaderOp {
  /** Имя заголовка (регистронезависимо при применении). */
  name: string;
  /** Значение для `set`; игнорируется для `remove`. */
  value: string;
  /** `set` — добавить/заменить; `remove` — удалить. */
  op: 'set' | 'remove';
}

/** Предикат по заголовку запроса: заголовок `name` содержит подстроку `value`. */
export interface HeaderPredicate {
  name: string;
  value: string;
}

/** Условие срабатывания правила. */
export interface MockMatcher {
  /** Методы; пустой массив — любой. */
  methods: HttpMethod[];
  /** Паттерн URL (glob или regex source). */
  pattern: string;
  patternKind: PatternKind;
  /** Доп. предикаты по заголовкам запроса (все должны совпасть). */
  headerPredicates: HeaderPredicate[];
}

/**
 * Как подменять ответ. `bodyMode`:
 *  - `passthrough` — реальный сетевой ответ, но с наложением `status`/заголовков;
 *  - `literal` — синтетический ответ с телом `body` как есть (короткое замыкание);
 *  - `json` — то же, но с `Content-Type: application/json` по умолчанию.
 * `body` может содержать плейсхолдеры `{{url}}`/`{{method}}`/`{{now}}`/`{{random}}`.
 */
export interface MockAction {
  /** Переопределить HTTP-статус (null — оставить исходный). */
  status: number | null;
  statusText: string;
  headers: HeaderOp[];
  bodyMode: 'passthrough' | 'literal' | 'json';
  body: string;
  /** Искусственная задержка в миллисекундах (0 — без задержки). */
  delayMs: number;
  /**
   * Троттлинг (TASK-023): симуляция «скорости канала» в килобитах/с. Задержка
   * пропорциональна размеру тела (`throttle.ts`), суммируется с `delayMs`. null —
   * без ограничения скорости.
   */
  throttleKbps: number | null;
  /**
   * Офлайн-режим (TASK-023): совпавший запрос отклоняется сетевой ошибкой (как
   * оборванная сеть), а не подменяется ответом. Приоритетнее подмены тела.
   */
  offline: boolean;
}

/** Правило подмены (сырое, хранится в настройках и редактируется в UI). */
export interface MockRule {
  id: string;
  label: string;
  enabled: boolean;
  matcher: MockMatcher;
  action: MockAction;
  /** null — без ограничения; N — сработать не более N раз. */
  once: number | null;
}

/** Скомпилированное действие (сериализуемо, уходит в перехватчик). */
export interface CompiledAction {
  status: number | null;
  statusText: string;
  headers: HeaderOp[];
  bodyMode: 'passthrough' | 'literal' | 'json';
  body: string;
  delayMs: number;
  /** Троттлинг канала в кбит/с (null — без ограничения); задержку считает `throttle.ts`. */
  throttleKbps: number | null;
  /** Офлайн: отклонить совпавший запрос сетевой ошибкой (приоритетнее подмены тела). */
  offline: boolean;
}

/**
 * Скомпилированное правило — сериализуемая форма для MAIN-перехватчика. Опасная
 * часть (glob→безопасный regex source с анкорингом/экранированием) уже посчитана
 * чистой `logic.ts`; перехватчик лишь строит `new RegExp(source, flags)` и тестит.
 */
export interface CompiledRule {
  id: string;
  methods: string[];
  urlRegexSource: string;
  urlRegexFlags: string;
  headerPredicates: HeaderPredicate[];
  action: CompiledAction;
  /** Остаток срабатываний (null — без лимита). Перехватчик ведёт счётчик по id. */
  remaining: number | null;
}

/**
 * Сценарий мока (TASK-023) — именованная группа ссылок на правила. Ровно один
 * сценарий может быть активным (или «выкл»); активный сценарий определяет плоский
 * набор действующих правил (резолвер — `scenarios.ts`). Ссылки по `id` правил, а не
 * копии: единый источник правил остаётся в `MockNetworkSettingsState.rules`.
 */
export interface MockScenario {
  id: string;
  label: string;
  description: string;
  /** id правил, входящих в сценарий (порядок наследуется из общего списка правил). */
  ruleIds: string[];
}

/** Метаданные запроса — вход матчинга (чистый объект, тестируется без DOM). */
export interface RequestMeta {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
}

/** Снимок пойманного запроса — возвращается в UI (без живых объектов). */
export interface CaughtRequest {
  /** Монотонный id в рамках сессии перехвата (для дедупа в UI). */
  id: number;
  method: string;
  url: string;
  status: number;
  /** Сработало ли правило подмены. */
  mocked: boolean;
  /** id сработавшего правила либо null. */
  ruleId: string | null;
  /** Тип ресурса (`fetch`/`xhr`). */
  source: 'fetch' | 'xhr';
  /** Размер тела ответа в байтах (оценка). */
  sizeBytes: number;
  /** Длительность в миллисекундах. */
  durationMs: number;
  /** Метка старта (`performance.now()` округлённая). */
  startedAt: number;
  /** Ошибка сети (если запрос упал) либо null. */
  error: string | null;
}

/**
 * Пара ключ/значение с тумблером — строка редактора query/заголовков в replay
 * (TASK-038). `enabled: false` — строка сохраняется, но не уходит в запрос/URL.
 */
export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

/** Пара имя/значение заголовка ответа (без тумблера — только чтение). */
export interface HeaderPair {
  key: string;
  value: string;
}

/**
 * Модель одного replay-запроса (TASK-038). `url` — база без query-строки (query
 * редактируется отдельным списком, собирается через `buildUrl`). `bodyMode`:
 * `none` — без тела (для GET/HEAD), `raw` — тело как есть, `json` — то же тело, но
 * с подсказкой Content-Type и переиспользованием pretty/minify декодеров.
 */
export interface RequestSpec {
  method: string;
  url: string;
  query: KeyValue[];
  headers: KeyValue[];
  body: string;
  bodyMode: 'none' | 'raw' | 'json';
}

/** Метаданные ответа replay (TASK-038) — снимок для панели ответа. */
export interface ResponseMeta {
  status: number;
  statusText: string;
  headers: HeaderPair[];
  body: string;
  /** Тело обрезано по лимиту размера (для честной пометки в UI). */
  truncated: boolean;
  sizeBytes: number;
  durationMs: number;
  /** Финальный URL после редиректов. */
  url: string;
}

/** Вид сбоя replay — честный типизированный результат вместо throw в UI. */
export type ReplayErrorKind = 'network' | 'timeout' | 'too-large' | 'aborted' | 'bad-request';

export interface ReplayError {
  kind: ReplayErrorKind;
  message: string;
}

/** Дискриминируемый результат отправки replay: ответ либо типизированный сбой. */
export type ReplayResult = { ok: true; response: ResponseMeta } | { ok: false; error: ReplayError };

/** Запись лёгкой истории replay (TASK-038) — спека + метка/статус последнего прогона. */
export interface ReplayHistoryEntry {
  id: string;
  spec: RequestSpec;
  /** epoch ms последнего запуска. */
  at: number;
  /** Статус последнего ответа либо null (сбой/ещё не отвечал). */
  status: number | null;
}

/** Состояние, инъектируемое в перехватчик (правила + лимиты). */
export interface InterceptorState {
  rules: CompiledRule[];
  /** Максимум записей в кольцевом логе (защита от разрастания). */
  logCap: number;
  /** Максимум байт тела запроса/ответа, сохраняемых для превью. */
  bodyCap: number;
}

/**
 * Персистентное состояние фичи (namespace `mock-network`).
 *
 * Мастер-тумблер перехвата (`enabled`) СОЗНАТЕЛЬНО здесь НЕ хранится: это живое
 * рантайм-состояние сессии панели, привязанное к конкретной вкладке (`tabIdRef`)
 * и к инъектированному перехватчику / CDP-attach, которые не переживают
 * переоткрытие side panel или перезапуск service worker. Персист `enabled=true`
 * приводил бы к «фантомно-включённому» состоянию: панель показывает «активно», но
 * `tabIdRef===null` → опрос молча ничего не трекает (ни MAIN, ни CDP). Поэтому
 * тумблер живёт только в `useState` и на маунте всегда «выключен».
 */
export interface MockNetworkSettingsState {
  rules: MockRule[];
  /** Строка фильтра списка запросов. */
  filter: string;
  /** Режим перехвата: MAIN-инъекция (дефолт) либо CDP (задел). */
  strategy: 'main' | 'cdp';
  /** Именованные сценарии (группы правил), TASK-023. */
  scenarios: MockScenario[];
  /** id активного сценария либо null («выкл» — работают per-rule `enabled`). */
  activeScenarioId: string | null;
  /** Лёгкая история replay (TASK-038), новые впереди. Кап — `REPLAY_LIMITS.maxHistory`. */
  replayHistory: ReplayHistoryEntry[];
}

export const DEFAULT_MATCHER: MockMatcher = {
  methods: [],
  pattern: '*',
  patternKind: 'glob',
  headerPredicates: [],
};

export const DEFAULT_ACTION: MockAction = {
  status: 200,
  statusText: '',
  headers: [],
  bodyMode: 'json',
  body: '{}',
  delayMs: 0,
  throttleKbps: null,
  offline: false,
};

export const MOCK_NETWORK_DEFAULTS: MockNetworkSettingsState = {
  rules: [],
  filter: '',
  strategy: 'main',
  scenarios: [],
  activeScenarioId: null,
  replayHistory: [],
};

/** Лимиты перехвата (кольцевой лог/капы тел) — единый источник для bridge/перехватчика. */
export const INTERCEPTOR_LIMITS = { logCap: 200, bodyCap: 64 * 1024 } as const;

/**
 * Лимиты replay (TASK-038): таймаут отправки, максимум байт ответа (защита памяти
 * SW) и глубина истории. Единый источник для sender/history/UI.
 */
export const REPLAY_LIMITS = {
  timeoutMs: 30_000,
  maxBytes: 5 * 1024 * 1024,
  maxHistory: 25,
} as const;

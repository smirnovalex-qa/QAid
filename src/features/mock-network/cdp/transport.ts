/**
 * CDP-транспорт мока сети (TASK-032) — ВТОРОЙ транспорт поверх ТОГО ЖЕ движка правил
 * (`logic.ts` из TASK-022). Ловит запросы через протокол отладки (`chrome.debugger` +
 * CDP `Fetch` domain), в т.ч. те, что проходят мимо MAIN-обёрток fetch/XHR (воркеры,
 * `sendBeacon`, ресурсы) и при строгом CSP — ценой баннера отладки (opt-in).
 *
 * Корректность резолва (матчинг URL/метода/заголовков, компиляция glob→regex,
 * подстановка тела, слияние заголовков) НЕ дублируется — берётся из `logic.ts`;
 * задержка/троттлинг — из `throttle.ts`. Этот слой лишь ТРАНСЛИРУЕТ решение движка в
 * CDP-команды (`Fetch.fulfillRequest`/`continueRequest`/`failRequest`) — паритет с
 * MAIN-перехватчиком (`interceptor.ts`): синтетическое короткое замыкание для
 * literal/json, офлайн как сетевая ошибка, passthrough с наложением статуса/заголовков
 * на реальный ответ (через перехват стадии Response), задержка/троттлинг по размеру тела.
 *
 * Счётчики `once` ведём локально по id (как MAIN-перехватчик), а матчинг —
 * `logic.matchRule`; так «опасная» часть остаётся единой и покрытой. Лог пойманных
 * запросов живёт в памяти SW и отдаётся панели по опросу (приватность: наружу ничего
 * не уходит). fail-open: любая ошибка применения правила → запрос продолжается как есть.
 */
import { logger } from '@/shared/logger';
import { matchRule, mergeResponseHeaders, resolveBody, defaultContentType } from '../logic';
import { computeThrottleDelay } from '../throttle';
import { INTERCEPTOR_LIMITS } from '../types';
import type { CaughtRequest, CompiledRule } from '../types';

/** CDP `Fetch.enable`: перехватываем ВСЕ запросы на стадии Request; матчинг — в JS. */
export function buildEnableParams(): { patterns: { urlPattern: string }[] } {
  return { patterns: [{ urlPattern: '*' }] };
}

/** Заголовок ответа в форме CDP (`Fetch.fulfillRequest.responseHeaders`). */
export interface CdpHeaderEntry {
  name: string;
  value: string;
}

/** Тело запроса из события `Fetch.requestPaused`. */
export interface CdpFetchRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
}

/**
 * Событие `Fetch.requestPaused`. Наличие `responseStatusCode`/`responseErrorReason`
 * означает стадию Response (перехват реального ответа для passthrough-наложения).
 */
export interface CdpRequestPausedEvent {
  requestId: string;
  request: CdpFetchRequest;
  responseStatusCode?: number;
  responseErrorReason?: string;
  responseHeaders?: CdpHeaderEntry[];
  /** Тип ресурса CDP (`Document`/`XHR`/`Fetch`/`Script`/…) — для колонки source. */
  resourceType?: string;
}

/** Тип источника из `resourceType` CDP: XHR отдельно, всё прочее — `fetch` (паритет с MAIN). */
function sourceOf(event: CdpRequestPausedEvent): 'fetch' | 'xhr' {
  return event.resourceType === 'XHR' ? 'xhr' : 'fetch';
}

/** Размер тела из заголовка `content-length` реального ответа (0 — если отсутствует/невалиден). */
function readContentLength(headers: CdpHeaderEntry[] | undefined): number {
  for (const h of headers ?? []) {
    if (h.name.toLowerCase() === 'content-length') {
      const n = Number(h.value);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
  }
  return 0;
}

/** Ответ `Fetch.getResponseBody`. */
interface CdpResponseBody {
  body: string;
  base64Encoded: boolean;
}

/** Преобразует набор заголовков (Record) в список пар для CDP. */
export function toHeaderList(headers: Record<string, string>): CdpHeaderEntry[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

/** UTF-8-безопасное base64-кодирование тела (CDP ждёт `body` как base64). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** План действия на стадии Request (что послать в CDP по совпавшему правилу). */
export type RequestStagePlan =
  | { kind: 'fail'; errorReason: string; delayMs: number }
  | {
      kind: 'fulfill';
      responseCode: number;
      responsePhrase?: string;
      headers: CdpHeaderEntry[];
      body: string;
      delayMs: number;
      sizeBytes: number;
    }
  | { kind: 'intercept-response' };

/**
 * Транслирует совпавшее правило в план стадии Request. Приоритет — офлайн (сетевая
 * ошибка), затем синтетика (literal/json — короткое замыкание), иначе passthrough:
 * перехватываем реальный ответ на стадии Response для наложения статуса/заголовков.
 * Резолв тела/заголовков — из `logic.ts`; задержка — из `throttle.ts`.
 */
export function planRequestStage(
  rule: CompiledRule,
  event: CdpRequestPausedEvent,
): RequestStagePlan {
  const a = rule.action;
  if (a.offline) {
    return { kind: 'fail', errorReason: 'Failed', delayMs: Math.max(0, a.delayMs) };
  }
  if (a.bodyMode !== 'passthrough') {
    const { url, method } = event.request;
    const body = resolveBody(a.body, { url, method });
    const headers = mergeResponseHeaders(
      { 'content-type': defaultContentType(a.bodyMode) },
      a.headers,
    );
    return {
      kind: 'fulfill',
      responseCode: a.status ?? 200,
      // `exactOptionalPropertyTypes`: опущенный phrase, а не явный `undefined`.
      ...(a.statusText.length > 0 ? { responsePhrase: a.statusText } : {}),
      headers: toHeaderList(headers),
      body,
      sizeBytes: body.length,
      delayMs: computeThrottleDelay(body.length, {
        delayMs: a.delayMs,
        throttleKbps: a.throttleKbps,
      }),
    };
  }
  return { kind: 'intercept-response' };
}

/** План наложения на реальный ответ (стадия Response, passthrough). */
export interface ResponseStagePlan {
  responseCode: number;
  responsePhrase?: string;
  headers: CdpHeaderEntry[];
}

/**
 * Транслирует passthrough-правило в наложение поверх реального ответа: статус —
 * override правила либо исходный; заголовки — слияние `logic.mergeResponseHeaders`
 * поверх реальных. Тело реального ответа берётся отдельно (`Fetch.getResponseBody`).
 */
export function planResponseStage(
  rule: CompiledRule,
  event: CdpRequestPausedEvent,
): ResponseStagePlan {
  const a = rule.action;
  const base: Record<string, string> = {};
  for (const h of event.responseHeaders ?? []) base[h.name] = h.value;
  return {
    responseCode: a.status ?? event.responseStatusCode ?? 200,
    // `exactOptionalPropertyTypes`: опущенный phrase, а не явный `undefined`.
    ...(a.statusText.length > 0 ? { responsePhrase: a.statusText } : {}),
    headers: toHeaderList(mergeResponseHeaders(base, a.headers)),
  };
}

/** Тонкий доступ к отправке CDP-команд (подмножество платформенного seam). */
export interface CdpCommandSink {
  sendCommand(tabId: number, method: string, params?: object): Promise<unknown>;
}

/** Зависимости процессора (инъекция для тестируемости без Chrome). */
export interface CdpTransportDeps {
  tabId: number;
  seam: CdpCommandSink;
  logCap?: number;
  /** Источник времени для длительностей (тесты детерминируют). */
  now?: () => number;
}

/** Процессор событий `Fetch.requestPaused` одной CDP-сессии. */
export interface CdpFetchProcessor {
  /** Обновляет действующий набор правил и пересобирает счётчики `once`. */
  updateRules(rules: CompiledRule[]): void;
  /** Включает перехват (`Fetch.enable`) на прикреплённой вкладке. */
  enable(): Promise<void>;
  /** Диспетчер событий отладчика (вызывается из lifecycle на `onEvent`). */
  handleEvent(source: { tabId?: number }, method: string, params?: unknown): void;
  /** Снимок лога пойманных запросов (для опроса панелью). */
  readLog(): CaughtRequest[];
  /** Сбрасывает незавершённые перехваты (при detach). */
  reset(): void;
}

/**
 * Создаёт процессор CDP-перехвата для одной вкладки. Держит правила, счётчики `once`,
 * кольцевой лог и карту незавершённых passthrough-перехватов (по requestId). Все
 * действия — fail-open: ошибка отправки команды логируется, но не роняет сессию.
 */
export function createCdpFetchProcessor(deps: CdpTransportDeps): CdpFetchProcessor {
  const { tabId, seam } = deps;
  const logCap = deps.logCap ?? INTERCEPTOR_LIMITS.logCap;
  const now = deps.now ?? (() => Math.round(performance.now()));

  let rules: CompiledRule[] = [];
  const counts: Record<string, number | null> = {};
  const log: CaughtRequest[] = [];
  let seq = 0;
  /**
   * Незавершённые перехваты стадии Response: requestId → старт + правило. `rule: null`
   * — наблюдение без правила (паритет с MAIN: логируем ВСЕ запросы, а не только моки),
   * реальный ответ пропускается без мутации; `rule: CompiledRule` — passthrough-наложение.
   */
  const pending = new Map<string, { rule: CompiledRule | null; startedAt: number }>();

  const nextId = (): number => (seq += 1);

  const record = (entry: CaughtRequest): void => {
    log.push(entry);
    if (log.length > logCap) log.splice(0, log.length - logCap);
  };

  const delay = (ms: number): Promise<void> =>
    ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

  /** Совпадение по действующим правилам с учётом остатка `once` (как MAIN-перехватчик). */
  const findMatch = (event: CdpRequestPausedEvent): CompiledRule | undefined => {
    const req = {
      method: event.request.method,
      url: event.request.url,
      requestHeaders: event.request.headers ?? {},
    };
    for (const rule of rules) {
      if (counts[rule.id] === 0) continue;
      if (matchRule(rule, req)) return rule;
    }
    return undefined;
  };

  const consume = (rule: CompiledRule): void => {
    const c = counts[rule.id];
    if (typeof c === 'number' && c > 0) counts[rule.id] = c - 1;
  };

  const send = (method: string, params: object): Promise<unknown> =>
    seam.sendCommand(tabId, method, params);

  const continueRequest = (requestId: string, interceptResponse = false): Promise<unknown> =>
    send(
      'Fetch.continueRequest',
      interceptResponse ? { requestId, interceptResponse } : { requestId },
    );

  const continueResponse = (requestId: string): Promise<unknown> =>
    send('Fetch.continueResponse', { requestId });

  /** Стадия Request: решаем и отправляем терминальную CDP-команду по совпавшему правилу. */
  const processRequest = async (event: CdpRequestPausedEvent): Promise<void> => {
    const { url, method } = event.request;
    const startedAt = now();
    const rule = findMatch(event);
    if (!rule) {
      // Паритет с MAIN-перехватчиком: в лог попадают ВСЕ запросы, не только замоканные.
      // Реального статуса на стадии Request ещё нет — перехватываем стадию Response
      // (`interceptResponse`), чтобы записать настоящий статус/размер и пропустить ответ
      // как есть (без мутации). Так список запросов наполняется и без активных правил.
      pending.set(event.requestId, { rule: null, startedAt });
      await continueRequest(event.requestId, true);
      return;
    }
    consume(rule);
    const plan = planRequestStage(rule, event);

    if (plan.kind === 'fail') {
      await delay(plan.delayMs);
      await send('Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: plan.errorReason,
      });
      record({
        id: nextId(),
        method,
        url,
        status: 0,
        mocked: true,
        ruleId: rule.id,
        source: sourceOf(event),
        sizeBytes: 0,
        durationMs: now() - startedAt,
        startedAt,
        error: 'offline (emulated)',
      });
      return;
    }

    if (plan.kind === 'fulfill') {
      await delay(plan.delayMs);
      await send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: plan.responseCode,
        ...(plan.responsePhrase !== undefined ? { responsePhrase: plan.responsePhrase } : {}),
        responseHeaders: plan.headers,
        body: toBase64(plan.body),
      });
      record({
        id: nextId(),
        method,
        url,
        status: plan.responseCode,
        mocked: true,
        ruleId: rule.id,
        source: sourceOf(event),
        sizeBytes: plan.sizeBytes,
        durationMs: now() - startedAt,
        startedAt,
        error: null,
      });
      return;
    }

    // passthrough: перехватываем реальный ответ на стадии Response для наложения.
    pending.set(event.requestId, { rule, startedAt });
    await continueRequest(event.requestId, true);
  };

  /** Стадия Response: накладываем статус/заголовки правила на реальный ответ. */
  const processResponse = async (event: CdpRequestPausedEvent): Promise<void> => {
    const pend = pending.get(event.requestId);
    pending.delete(event.requestId);
    if (!pend) {
      await continueResponse(event.requestId);
      return;
    }
    const { url, method } = event.request;

    // Наблюдение без правила (паритет с MAIN): пишем реальный статус/размер и пропускаем
    // ответ БЕЗ мутации. Тело реального ответа не читаем (как MAIN для несовпавших) —
    // размер берём из `content-length`. fail-open: ошибка отпускания не роняет сессию.
    if (pend.rule === null) {
      const errorReason = event.responseErrorReason;
      record({
        id: nextId(),
        method,
        url,
        status: event.responseStatusCode ?? 0,
        mocked: false,
        ruleId: null,
        source: sourceOf(event),
        sizeBytes: readContentLength(event.responseHeaders),
        durationMs: now() - pend.startedAt,
        startedAt: pend.startedAt,
        error: errorReason ?? null,
      });
      // Сетевая ошибка на стадии Response не допускает `continueResponse` — отпускаем
      // запрос как продолжение (провалится штатно); иначе пропускаем реальный ответ.
      if (errorReason !== undefined) {
        await continueRequest(event.requestId).catch((e: unknown) => {
          logger.debug('mock.cdp.observe.error', e);
        });
      } else {
        await continueResponse(event.requestId).catch((e: unknown) => {
          logger.debug('mock.cdp.observe', e);
        });
      }
      return;
    }

    try {
      const raw = (await send('Fetch.getResponseBody', {
        requestId: event.requestId,
      })) as CdpResponseBody;
      const bodyBase64 = raw.base64Encoded ? raw.body : toBase64(raw.body);
      const sizeBytes = raw.base64Encoded
        ? Math.floor((raw.body.length * 3) / 4)
        : new TextEncoder().encode(raw.body).length;
      const plan = planResponseStage(pend.rule, event);
      const a = pend.rule.action;
      await delay(
        computeThrottleDelay(sizeBytes, { delayMs: a.delayMs, throttleKbps: a.throttleKbps }),
      );
      await send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: plan.responseCode,
        ...(plan.responsePhrase !== undefined ? { responsePhrase: plan.responsePhrase } : {}),
        responseHeaders: plan.headers,
        body: bodyBase64,
      });
      record({
        id: nextId(),
        method,
        url,
        status: plan.responseCode,
        mocked: true,
        ruleId: pend.rule.id,
        source: sourceOf(event),
        sizeBytes,
        durationMs: now() - pend.startedAt,
        startedAt: pend.startedAt,
        error: null,
      });
    } catch (e) {
      // fail-open: не смогли наложить — отпускаем реальный ответ как есть.
      logger.debug('mock.cdp.response', e);
      await continueResponse(event.requestId).catch(() => undefined);
    }
  };

  const processPaused = async (event: CdpRequestPausedEvent): Promise<void> => {
    const isResponseStage =
      event.responseStatusCode !== undefined || event.responseErrorReason !== undefined;
    if (isResponseStage) {
      await processResponse(event);
      return;
    }
    await processRequest(event);
  };

  return {
    updateRules(next: CompiledRule[]): void {
      rules = next;
      // Пересобираем счётчики `once` под новый набор (как idempotent-переустановка MAIN).
      for (const key of Object.keys(counts)) Reflect.deleteProperty(counts, key);
      for (const rule of next) counts[rule.id] = rule.remaining;
    },
    enable(): Promise<void> {
      return send('Fetch.enable', buildEnableParams()) as Promise<void>;
    },
    handleEvent(source: { tabId?: number }, method: string, params?: unknown): void {
      if (method !== 'Fetch.requestPaused') return;
      if (source.tabId !== tabId) return;
      void processPaused(params as CdpRequestPausedEvent).catch((e: unknown) => {
        logger.debug('mock.cdp.paused', e);
      });
    },
    readLog(): CaughtRequest[] {
      return [...log];
    },
    reset(): void {
      pending.clear();
    },
  };
}

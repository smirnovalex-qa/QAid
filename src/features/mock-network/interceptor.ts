/**
 * MAIN-world перехватчик fetch/XHR для мока сети (TASK-022, ADR гибридной стратегии).
 *
 * Эти функции инъектируются в контекст страницы через
 * `chrome.scripting.executeScript({ world: 'MAIN', func, args })` — Chrome
 * сериализует их как `func.toString()`, поэтому каждая ОБЯЗАНА быть
 * самодостаточной: только свой аргумент + глобалы страницы (`window`, `fetch`,
 * `XMLHttpRequest`, `Response`, `Headers`, `performance`). Никаких рантайм-импортов
 * (только `import type`, который стирается компилятором). Отсюда осознанное
 * дублирование мелкой логики матчинга/слияния — её «опасная» часть (glob→безопасный
 * regex source) уже посчитана тестируемой `logic.ts`, сюда приходит готовый source.
 *
 * Приватность: перехваченные тела/заголовки НЕ покидают страницу иначе как в
 * снимок лога, который забирает только наша же панель по запросу (`mock/poll`).
 * fail-open: любая ошибка применения правила → реальный запрос идёт как есть.
 */
import type { CaughtRequest, CompiledRule, InterceptorState } from './types';

/** Форма нашего состояния на `window` (живёт между запросами одной сессии страницы). */
interface MockStore {
  installed: true;
  seq: number;
  log: CaughtRequest[];
  logCap: number;
  bodyCap: number;
  rules: CompiledRule[];
  /**
   * Прекомпилированные URL-regex, ПАРАЛЛЕЛЬНО `rules` по индексу (F5 TASK-046).
   * `null` — невалидный паттерн (никогда не матчится, как и раньше при исключении в
   * `new RegExp`). Пересобирается один раз при установке/обновлении набора правил, а
   * не на каждый перехваченный запрос.
   */
  compiled: (RegExp | null)[];
  counts: Record<string, number | null>;
  origFetch: typeof fetch;
  origOpen: XMLHttpRequest['open'];
  origSend: XMLHttpRequest['send'];
}

/**
 * Устанавливает (или переустанавливает) перехватчик. Идемпотентно: если обёртки
 * уже стоят — обновляем только правила и счётчики `once` (без повторного оборачивания
 * fetch/XHR), так что синк правил не плодит обёрток и работает без перезагрузки.
 */
export function installMockInterceptor(state: InterceptorState): void {
  // ВАЖНО (ADR-0028): литерал ключа объявлен ВНУТРИ функции. Тело сериализуется в
  // MAIN-world через `func.toString()` без замыкания модуля — ссылка на константу
  // уровня модуля стала бы свободной и упала ReferenceError на странице.
  const STORE_KEY = '__qatbMock__';
  const win = window as unknown as Record<string, MockStore | undefined>;
  const existing = win[STORE_KEY];

  // Прекомпиляция URL-regex ОДИН РАЗ при построении/обновлении набора (F5 TASK-046).
  // Самодостаточна (ADR-0028): только аргумент + глобальный `RegExp`, без ссылок на
  // модуль. Невалидный паттерн → `null` (никогда не матчится — та же семантика, что и
  // прежний try/catch внутри `matchRule`, но ошибка ловится на этапе компиляции).
  const compileRegexes = (rules: CompiledRule[]): (RegExp | null)[] =>
    rules.map((rule) => {
      try {
        return new RegExp(rule.urlRegexSource, rule.urlRegexFlags);
      } catch {
        return null;
      }
    });

  // Счётчики `once` заводим заново под новый набор правил.
  const counts: Record<string, number | null> = {};
  for (const rule of state.rules) counts[rule.id] = rule.remaining;

  if (existing) {
    existing.rules = state.rules;
    existing.compiled = compileRegexes(state.rules);
    existing.counts = counts;
    existing.logCap = state.logCap;
    existing.bodyCap = state.bodyCap;
    return;
  }

  const store: MockStore = {
    installed: true,
    seq: 0,
    log: [],
    logCap: state.logCap,
    bodyCap: state.bodyCap,
    rules: state.rules,
    compiled: compileRegexes(state.rules),
    counts,
    origFetch: window.fetch.bind(window),
    // Захватываем оригиналы прототипа для восстановления/passthrough (не вызываем
    // как unbound — только сохраняем и позже применяем с явным `this`).
    /* eslint-disable @typescript-eslint/unbound-method */
    origOpen: XMLHttpRequest.prototype.open,
    origSend: XMLHttpRequest.prototype.send,
    /* eslint-enable @typescript-eslint/unbound-method */
  };
  win[STORE_KEY] = store;

  // — Инлайновые хелперы (самодостаточны; дублируют logic.ts осознанно) —

  const delay = (ms: number): Promise<void> =>
    ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

  // Троттлинг (TASK-023): фиксированная задержка + транспортная по размеру тела.
  // Дублирует `throttle.ts` осознанно (тело сериализуется в MAIN без замыкания
  // модуля, ADR-0028): kbps — кбит/с, время передачи = sizeBytes·8 / kbps мс.
  const computeDelay = (
    sizeBytes: number,
    delayMs: number,
    throttleKbps: number | null,
  ): number => {
    const base = delayMs > 0 ? delayMs : 0;
    if (throttleKbps === null || throttleKbps <= 0 || sizeBytes <= 0) return base;
    return base + Math.ceil((sizeBytes * 8) / throttleKbps);
  };

  const headerValue = (headers: Record<string, string>, name: string): string | undefined => {
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) return headers[key];
    }
    return undefined;
  };

  // Матчинг по УЖЕ скомпилированному regex (F5 TASK-046): компиляция вынесена в
  // `compileRegexes` (один раз на набор правил). `re === null` — невалидный паттерн →
  // не матчится (та же семантика, что и прежний try/catch на каждый запрос).
  const matchRule = (
    rule: CompiledRule,
    re: RegExp | null,
    method: string,
    url: string,
    reqHeaders: Record<string, string>,
  ): boolean => {
    if (rule.methods.length > 0 && !rule.methods.includes(method.toUpperCase())) return false;
    // `re` null (невалидный паттерн) → `re?.test` undefined → `!undefined` = true → не матч.
    if (!re?.test(url)) return false;
    for (const pred of rule.headerPredicates) {
      const v = headerValue(reqHeaders, pred.name);
      if (!v?.includes(pred.value)) return false;
    }
    return true;
  };

  const findMatch = (
    method: string,
    url: string,
    reqHeaders: Record<string, string>,
  ): CompiledRule | undefined => {
    for (let i = 0; i < store.rules.length; i += 1) {
      const rule = store.rules[i];
      if (!rule) continue;
      if (store.counts[rule.id] === 0) continue;
      if (matchRule(rule, store.compiled[i] ?? null, method, url, reqHeaders)) return rule;
    }
    return undefined;
  };

  const consume = (rule: CompiledRule): void => {
    const c = store.counts[rule.id];
    if (typeof c === 'number' && c > 0) store.counts[rule.id] = c - 1;
  };

  const mergeHeaders = (
    base: Record<string, string>,
    ops: CompiledRule['action']['headers'],
  ): Record<string, string> => {
    const out: Record<string, string> = { ...base };
    for (const op of ops) {
      const lower = op.name.toLowerCase();
      const key = Object.keys(out).find((k) => k.toLowerCase() === lower);
      if (op.op === 'remove') {
        if (key !== undefined) Reflect.deleteProperty(out, key);
        continue;
      }
      out[key ?? op.name] = op.value;
    }
    return out;
  };

  const resolveBody = (template: string, url: string, method: string): string =>
    template.replace(/\{\{(url|method|now|random)\}\}/g, (_m, k: string) => {
      if (k === 'url') return url;
      if (k === 'method') return method;
      if (k === 'now') return new Date().toISOString();
      return Math.floor(Math.random() * 0xffffffff).toString(16);
    });

  const defaultCT = (mode: CompiledRule['action']['bodyMode']): string =>
    mode === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';

  const record = (entry: CaughtRequest): void => {
    store.log.push(entry);
    if (store.log.length > store.logCap) store.log.splice(0, store.log.length - store.logCap);
  };

  const nextId = (): number => (store.seq += 1);

  // — Обёртка fetch —
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const reqHeaders: Record<string, string> = {};
    const initHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    if (initHeaders) {
      new Headers(initHeaders).forEach((value, key) => {
        reqHeaders[key] = value;
      });
    }
    const startedAt = Math.round(performance.now());
    const rule = findMatch(method, url, reqHeaders);

    // Офлайн (TASK-023): совпавший запрос падает сетевой ошибкой, как оборванная
    // сеть (приоритетнее подмены тела). Логируем и отклоняем ДО try — единый record.
    if (rule?.action.offline) {
      consume(rule);
      await delay(rule.action.delayMs);
      record({
        id: nextId(),
        method,
        url,
        status: 0,
        mocked: true,
        ruleId: rule.id,
        source: 'fetch',
        sizeBytes: 0,
        durationMs: Math.round(performance.now()) - startedAt,
        startedAt,
        error: 'offline (emulated)',
      });
      throw new TypeError('Failed to fetch');
    }

    try {
      if (rule && rule.action.bodyMode !== 'passthrough') {
        // Короткое замыкание синтетическим ответом (без реальной сети).
        consume(rule);
        const status = rule.action.status ?? 200;
        const body = resolveBody(rule.action.body, url, method);
        await delay(computeDelay(body.length, rule.action.delayMs, rule.action.throttleKbps));
        const headers = mergeHeaders(
          { 'content-type': defaultCT(rule.action.bodyMode) },
          rule.action.headers,
        );
        record({
          id: nextId(),
          method,
          url,
          status,
          mocked: true,
          ruleId: rule.id,
          source: 'fetch',
          sizeBytes: body.length,
          durationMs: Math.round(performance.now()) - startedAt,
          startedAt,
          error: null,
        });
        const st = rule.action.statusText;
        return new Response(
          body,
          st.length > 0 ? { status, statusText: st, headers } : { status, headers },
        );
      }

      const res = await store.origFetch(input, init);

      if (rule) {
        // passthrough с наложением статуса/заголовков поверх реального ответа.
        consume(rule);
        const bodyText = await res
          .clone()
          .text()
          .catch(() => '');
        // Троттлинг считаем по фактическому размеру реального тела.
        await delay(computeDelay(bodyText.length, rule.action.delayMs, rule.action.throttleKbps));
        const status = rule.action.status ?? res.status;
        const baseHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          baseHeaders[key] = value;
        });
        const headers = mergeHeaders(baseHeaders, rule.action.headers);
        record({
          id: nextId(),
          method,
          url,
          status,
          mocked: true,
          ruleId: rule.id,
          source: 'fetch',
          sizeBytes: bodyText.length,
          durationMs: Math.round(performance.now()) - startedAt,
          startedAt,
          error: null,
        });
        const st = rule.action.statusText.length > 0 ? rule.action.statusText : res.statusText;
        return new Response(bodyText, { status, statusText: st, headers });
      }

      record({
        id: nextId(),
        method,
        url,
        status: res.status,
        mocked: false,
        ruleId: null,
        source: 'fetch',
        sizeBytes: Number(res.headers.get('content-length') ?? 0),
        durationMs: Math.round(performance.now()) - startedAt,
        startedAt,
        error: null,
      });
      return res;
    } catch (error) {
      // fail-open: если применение правила упало — пробуем реальный запрос;
      // если и он упал (сеть) — логируем ошибку и пробрасываем.
      record({
        id: nextId(),
        method,
        url,
        status: 0,
        mocked: false,
        ruleId: null,
        source: 'fetch',
        sizeBytes: 0,
        durationMs: Math.round(performance.now()) - startedAt,
        startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  // — Обёртка XHR (короткое замыкание синтетикой + логирование) —
  // Реальные XHR-запросы логируются, но не мутируются (стриминг/переписывание тела
  // реального XHR — вне v1, честно задокументировано; основной путь подмены — fetch).
  interface PatchedXhr extends XMLHttpRequest {
    __qatbMethod?: string;
    __qatbUrl?: string;
    __qatbStart?: number;
  }

  XMLHttpRequest.prototype.open = function patchedOpen(
    this: PatchedXhr,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this.__qatbMethod = method.toUpperCase();
    this.__qatbUrl = typeof url === 'string' ? url : url.href;

    store.origOpen.apply(this, [method, url, ...rest] as unknown as Parameters<
      XMLHttpRequest['open']
    >);
  };

  XMLHttpRequest.prototype.send = function patchedSend(
    this: PatchedXhr,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const method = this.__qatbMethod ?? 'GET';
    const url = this.__qatbUrl ?? '';
    const startedAt = Math.round(performance.now());
    const rule = findMatch(method, url, {});

    // Офлайн (TASK-023): совпавший XHR завершается сетевой ошибкой (status 0 + событие
    // `error`), реальная сеть не вызывается.
    if (rule?.action.offline) {
      consume(rule);
      record({
        id: nextId(),
        method,
        url,
        status: 0,
        mocked: true,
        ruleId: rule.id,
        source: 'xhr',
        sizeBytes: 0,
        durationMs: 0,
        startedAt,
        error: 'offline (emulated)',
      });
      const selfErr = this as unknown as Record<string, unknown>;
      const fireError = (): void => {
        Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(this, 'status', { configurable: true, value: 0 });
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new Event('error'));
        this.dispatchEvent(new Event('loadend'));
        const onerror = selfErr.onerror;
        if (typeof onerror === 'function')
          (onerror as (this: XMLHttpRequest, ev: Event) => void).call(this, new Event('error'));
      };
      const d = rule.action.delayMs > 0 ? rule.action.delayMs : 0;
      if (d > 0) setTimeout(fireError, d);
      else fireError();
      return;
    }

    if (rule && rule.action.bodyMode !== 'passthrough') {
      const status = rule.action.status ?? 200;
      const text = resolveBody(rule.action.body, url, method);
      consume(rule);
      record({
        id: nextId(),
        method,
        url,
        status,
        mocked: true,
        ruleId: rule.id,
        source: 'xhr',
        sizeBytes: text.length,
        durationMs: 0,
        startedAt,
        error: null,
      });
      const self = this as unknown as Record<string, unknown>;
      const fire = (): void => {
        // Симулируем завершённый запрос: readyState=4 + свойства ответа + события.
        Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(this, 'status', { configurable: true, value: status });
        Object.defineProperty(this, 'responseText', { configurable: true, value: text });
        Object.defineProperty(this, 'response', { configurable: true, value: text });
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new Event('load'));
        this.dispatchEvent(new Event('loadend'));
        const onload = self.onload;
        if (typeof onload === 'function')
          (onload as (this: XMLHttpRequest, ev: Event) => void).call(this, new Event('load'));
      };
      const dly = computeDelay(text.length, rule.action.delayMs, rule.action.throttleKbps);
      if (dly > 0) setTimeout(fire, dly);
      else fire();
      return;
    }

    // passthrough: логируем по завершении (без мутации).
    this.addEventListener('loadend', () => {
      record({
        id: nextId(),
        method,
        url,
        status: this.status,
        mocked: false,
        ruleId: null,
        source: 'xhr',
        sizeBytes: typeof this.responseText === 'string' ? this.responseText.length : 0,
        durationMs: Math.round(performance.now()) - startedAt,
        startedAt,
        error: null,
      });
    });
    store.origSend.call(this, body ?? null);
  };
}

/** Снимает перехват (возвращает исходные fetch/XHR) и забывает состояние. No-op, если не стоял. */
export function clearMockInterceptor(): void {
  const STORE_KEY = '__qatbMock__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, MockStore | undefined>;
  const store = win[STORE_KEY];
  if (!store) return;
  window.fetch = store.origFetch;
  XMLHttpRequest.prototype.open = store.origOpen;
  XMLHttpRequest.prototype.send = store.origSend;
  win[STORE_KEY] = undefined;
}

/** Возвращает снимок лога пойманных запросов (пустой массив, если перехват не стоит). */
export function readMockLog(): CaughtRequest[] {
  const STORE_KEY = '__qatbMock__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, MockStore | undefined>;
  const store = win[STORE_KEY];
  return store ? [...store.log] : [];
}

/**
 * Чистая логика мока сети (TASK-022). Без DOM/chrome/Preact/zod (fitness §12.2):
 * матчинг запроса против правила, безопасная компиляция паттернов (glob→regex),
 * слияние заголовков ответа, разрешение тела с плейсхолдерами, приоритеты.
 *
 * Всё тестируется на «запрос-объектах» (`RequestMeta`) без браузера. Компиляция
 * паттернов происходит ЗДЕСЬ (тестируемо и ReDoS-безопасно), а MAIN-перехватчик
 * получает уже готовый `RegExp`-source и лишь строит `new RegExp(...).test(url)` —
 * опасная часть не дублируется в инъектируемой функции.
 */
import type {
  CaughtRequest,
  CompiledAction,
  CompiledRule,
  HeaderOp,
  HttpMethod,
  KeyValue,
  MockRule,
  RequestMeta,
  RequestSpec,
} from './types';

/** Максимальная длина пользовательского паттерна (защита от гигантских вводов). */
export const MAX_PATTERN_LENGTH = 2000;

/**
 * Экранирует спецсимволы regex в литеральном тексте. Используется при компиляции
 * glob: сперва экранируем ВСЁ, затем возвращаем смысл только `*`/`?`.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Компилирует glob (`*` — любая последовательность, `?` — один символ) в
 * анкоренный regex source. ReDoS-безопасно: нет вложенных квантификаторов —
 * `*`→`.*`, `?`→`.` над уже экранированным литералом, обрамление `^…$`.
 */
export function globToRegexSource(glob: string): string {
  const escaped = escapeRegex(glob).replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
  return `^${escaped}$`;
}

/** Результат компиляции паттерна: source+flags для `new RegExp`, либо null (невалиден). */
export interface CompiledPattern {
  source: string;
  flags: string;
}

/**
 * Компилирует matcher-паттерн. Для `glob` — безопасная трансляция. Для `regex` —
 * пользовательский source: валидируем через `new RegExp`, ограничиваем длину и НЕ
 * навязываем анкоринг (это ввод пользователя). Возвращает null при невалидности —
 * fail-safe: битое правило просто не матчит, а не роняет перехват.
 */
export function compilePattern(pattern: string, kind: 'glob' | 'regex'): CompiledPattern | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  const source = kind === 'glob' ? globToRegexSource(pattern) : pattern;
  try {
    // Проверяем компилируемость (и на glob-пути тоже — на случай экзотики).
    new RegExp(source, 'i');
  } catch {
    return null;
  }
  return { source, flags: 'i' };
}

/** Компилирует одно правило в сериализуемую форму. null — если паттерн невалиден. */
export function compileRule(rule: MockRule): CompiledRule | null {
  const compiled = compilePattern(rule.matcher.pattern, rule.matcher.patternKind);
  if (compiled === null) return null;

  const action: CompiledAction = {
    status: rule.action.status,
    statusText: rule.action.statusText,
    headers: rule.action.headers.map((h) => ({ ...h })),
    bodyMode: rule.action.bodyMode,
    body: rule.action.body,
    delayMs: Math.max(0, Math.floor(rule.action.delayMs)),
    // Троттлинг: положительное значение кбит/с либо null; невалидное (≤0/NaN) → null.
    throttleKbps:
      rule.action.throttleKbps !== null && rule.action.throttleKbps > 0
        ? Math.floor(rule.action.throttleKbps)
        : null,
    offline: rule.action.offline,
  };

  return {
    id: rule.id,
    methods: rule.matcher.methods.map((m) => m.toUpperCase()),
    urlRegexSource: compiled.source,
    urlRegexFlags: compiled.flags,
    headerPredicates: rule.matcher.headerPredicates.map((p) => ({ ...p })),
    action,
    remaining: rule.once,
  };
}

/**
 * Компилирует набор правил: только включённые, порядок массива = приоритет
 * (раньше — выше). Невалидные (битый паттерн) отбрасываются молча (fail-safe).
 */
export function compileRules(rules: MockRule[]): CompiledRule[] {
  const out: CompiledRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const compiled = compileRule(rule);
    if (compiled !== null) out.push(compiled);
  }
  return out;
}

/** Регистронезависимый поиск значения заголовка в наборе. */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

/**
 * Проверяет совпадение скомпилированного правила с запросом: метод (пустой список
 * методов = любой), URL (regex), все предикаты по заголовкам (подстрока,
 * регистронезависимо по имени). Ошибка компиляции regex на этом шаге → не совпало
 * (fail-safe, перехват не падает).
 */
export function matchRule(rule: CompiledRule, req: RequestMeta): boolean {
  if (rule.methods.length > 0 && !rule.methods.includes(req.method.toUpperCase())) {
    return false;
  }
  let re: RegExp;
  try {
    re = new RegExp(rule.urlRegexSource, rule.urlRegexFlags);
  } catch {
    return false;
  }
  if (!re.test(req.url)) return false;

  for (const pred of rule.headerPredicates) {
    const value = headerValue(req.requestHeaders, pred.name);
    if (!value?.includes(pred.value)) return false;
  }
  return true;
}

/**
 * Возвращает первое совпавшее правило с непустым остатком срабатываний (`remaining`
 * null = без лимита, >0 = ещё есть). Правила с исчерпанным `once` (remaining===0)
 * пропускаются — запрос идёт дальше по списку или напрямую.
 */
export function findMatch(rules: CompiledRule[], req: RequestMeta): CompiledRule | undefined {
  for (const rule of rules) {
    if (rule.remaining === 0) continue;
    if (matchRule(rule, req)) return rule;
  }
  return undefined;
}

/**
 * Сливает операции над заголовками ответа поверх базового набора. `set` —
 * добавить/заменить (регистронезависимо по имени, сохраняя исходный регистр ключа
 * при замене), `remove` — удалить. Возвращает НОВЫЙ объект (без мутации базы).
 */
export function mergeResponseHeaders(
  base: Record<string, string>,
  ops: HeaderOp[],
): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const op of ops) {
    const lower = op.name.toLowerCase();
    // Находим существующий ключ без учёта регистра, чтобы не плодить дубли.
    const existingKey = Object.keys(out).find((k) => k.toLowerCase() === lower);
    if (op.op === 'remove') {
      if (existingKey !== undefined) Reflect.deleteProperty(out, existingKey);
      continue;
    }
    out[existingKey ?? op.name] = op.value;
  }
  return out;
}

/** Контекст подстановки плейсхолдеров тела. Источники now/rand инъектируемы (тесты). */
export interface BodyContext {
  url: string;
  method: string;
  now?: () => number;
  rand?: () => number;
}

/**
 * Подставляет плейсхолдеры `{{url}}`/`{{method}}`/`{{now}}`/`{{random}}` в шаблон
 * тела. Никакого eval — только фиксированный словарь замен; неизвестные плейсхолдеры
 * остаются как есть. `{{now}}` — ISO-время, `{{random}}` — hex-токен.
 */
export function resolveBody(template: string, ctx: BodyContext): string {
  const now = ctx.now ?? Date.now;
  const rand = ctx.rand ?? Math.random;
  return template.replace(/\{\{(url|method|now|random)\}\}/g, (_match, key: string) => {
    switch (key) {
      case 'url':
        return ctx.url;
      case 'method':
        return ctx.method;
      case 'now':
        return new Date(now()).toISOString();
      case 'random':
        return Math.floor(rand() * 0xffffffff).toString(16);
      default:
        return _match;
    }
  });
}

/** Разрешённый статус ответа: переопределение правила либо исходный. */
export function resolveStatus(action: CompiledAction, originalStatus: number): number {
  return action.status ?? originalStatus;
}

/**
 * Content-Type по умолчанию для синтетического тела, если правило его не задаёт
 * явно: `json` → application/json, `literal` → text/plain. Используется и логикой,
 * и (продублировано осознанно) инъектируемым перехватчиком.
 */
export function defaultContentType(bodyMode: CompiledAction['bodyMode']): string {
  return bodyMode === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';
}

/** Все методы правила валидны? (используется валидацией формы UI). */
export function areMethodsValid(methods: string[]): methods is HttpMethod[] {
  const allowed = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  return methods.every((m) => allowed.has(m));
}

// ── Replay (TASK-038): чистая компоновка одного запроса на базе пойманного ──────

/** Методы, для которых уместно тело запроса (не GET/HEAD). */
export function methodAllowsBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD';
}

/**
 * Мутирующий метод: реальный побочный эффект на сервере (POST/PUT/PATCH/DELETE и
 * пр.) → UI требует подтверждения перед отправкой. GET/HEAD/OPTIONS считаются
 * «безопасными» (idempotent/read-only по семантике HTTP).
 */
export function isMutatingMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

/**
 * Разбирает URL на базу (без query) и список query-параметров. Fragment (`#…`)
 * отбрасывается — он не уходит на сервер. Парсинг через `URLSearchParams`
 * (декодирование percent-escape). Никогда не бросает: битый ввод → пустой query.
 */
export function parseUrl(raw: string): { base: string; query: KeyValue[] } {
  const qIdx = raw.indexOf('?');
  if (qIdx < 0) {
    const hIdx = raw.indexOf('#');
    return { base: hIdx >= 0 ? raw.slice(0, hIdx) : raw, query: [] };
  }
  const base = raw.slice(0, qIdx);
  let qs = raw.slice(qIdx + 1);
  const hIdx = qs.indexOf('#');
  if (hIdx >= 0) qs = qs.slice(0, hIdx);
  const query: KeyValue[] = [];
  try {
    const params = new URLSearchParams(qs);
    for (const [key, value] of params) query.push({ key, value, enabled: true });
  } catch {
    // URLSearchParams практически не бросает, но fail-safe: пустой query.
  }
  return { base, query };
}

/**
 * Собирает финальный URL из базы и списка query-параметров. База усечётся до части
 * перед `?` (идемпотентность: повторная сборка не плодит `?`). Учитываются только
 * включённые строки с непустым ключом. Значения percent-кодируются
 * (`URLSearchParams`).
 */
export function buildUrl(base: string, query: KeyValue[]): string {
  const path = base.split('?')[0] ?? '';
  const params = new URLSearchParams();
  for (const p of query) {
    if (!p.enabled || p.key === '') continue;
    params.append(p.key, p.value);
  }
  const qs = params.toString();
  return qs === '' ? path : `${path}?${qs}`;
}

/**
 * Строит `RequestSpec` из пойманного запроса (префилл редактора). Заголовки/тело
 * пойманного НЕ снимаются перехватчиком (`CaughtRequest` — лёгкий снимок), поэтому
 * они начинаются пустыми: честный префилл метода, URL и query из реального запроса.
 */
export function buildRequestSpecFromCaught(req: CaughtRequest): RequestSpec {
  const method = req.method.toUpperCase();
  const { base, query } = parseUrl(req.url);
  return {
    method: areMethodsValid([method]) ? method : 'GET',
    url: base,
    query,
    headers: [],
    body: '',
    bodyMode: methodAllowsBody(method) ? 'raw' : 'none',
  };
}

/** Пустая спека replay (дефолт редактора). */
export function emptyRequestSpec(): RequestSpec {
  return { method: 'GET', url: '', query: [], headers: [], body: '', bodyMode: 'none' };
}

/**
 * POSIX-экранирование значения для одинарных кавычек оболочки: `'` → `'\''`.
 * Обрамляем одинарными кавычками — внутри них спецсимволы shell не трактуются.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Сериализует `RequestSpec` в воспроизводимую команду cURL. `-X` — только для не-GET;
 * `-H` — каждый включённый непустой заголовок; `--data` — тело (для методов с телом
 * и непустой `bodyMode`). URL, заголовки и тело экранируются одинарными кавычками.
 * Только экспорт (импорт cURL — вне scope, PRD §3).
 */
export function toCurl(spec: RequestSpec): string {
  const method = spec.method.toUpperCase();
  const url = buildUrl(spec.url, spec.query);
  const parts: string[] = ['curl'];
  if (method !== 'GET') parts.push('-X', method);
  for (const h of spec.headers) {
    if (!h.enabled || h.key === '') continue;
    parts.push('-H', shellQuote(`${h.key}: ${h.value}`));
  }
  if (methodAllowsBody(method) && spec.bodyMode !== 'none' && spec.body !== '') {
    parts.push('--data', shellQuote(spec.body));
  }
  parts.push(shellQuote(url));
  return parts.join(' ');
}

/**
 * Приводит список включённых заголовков к парам `[name, value]` (пустые ключи
 * отброшены) — вход для `Headers`/`fetch`. Пустой результат — валиден (без
 * заголовков).
 */
export function toHeaderPairs(headers: KeyValue[]): [string, string][] {
  const out: [string, string][] = [];
  for (const h of headers) {
    if (!h.enabled || h.key === '') continue;
    out.push([h.key, h.value]);
  }
  return out;
}

/** Результат форматирования JSON для replay-редактора (best-effort). */
export type JsonFormatResult = { ok: true; value: string } | { ok: false };

/** Внутреннее форматирование: `indent === 0` — минификация; пустой/невалидный вход → `ok:false`. */
function formatJson(input: string, indent: number): JsonFormatResult {
  if (input.trim().length === 0) return { ok: false };
  try {
    const parsed: unknown = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed, null, indent) };
  } catch {
    return { ok: false };
  }
}

/**
 * Форматирует JSON с отступом `opts.indent` для тела запроса/ответа replay. Осознанно
 * НЕ зависит от фичи `decoders` (инвариант расширяемости §1: фичи не импортируют друг
 * друга) — это лёгкий best-effort форматтер без rich-диагностики позиции ошибки.
 */
export function prettyJson(input: string, opts: { indent: number }): JsonFormatResult {
  return formatJson(input, opts.indent);
}

/** Минифицирует JSON (компактный `JSON.stringify`); пустой/невалидный вход → `ok:false`. */
export function minifyJson(input: string): JsonFormatResult {
  return formatJson(input, 0);
}

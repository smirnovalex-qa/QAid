/**
 * Zod-схемы правил мока сети (TASK-022) + импорт/экспорт набора (JSON). Держим zod
 * ЗДЕСЬ, а не в чистой `logic.ts` (fitness §12.2), и переиспользуем схему как
 * единый источник формы правила для настроек (`settings.ts`) и сообщений
 * (`messages.ts`). Импорт/экспорт — задел под шаринг наборов (TASK-029/030).
 */
import { z } from 'zod';
import type { MockRule, MockScenario } from './types';
import { DEFAULT_ACTION, DEFAULT_MATCHER } from './types';

export const HttpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export const HeaderOpSchema = z.object({
  name: z.string(),
  value: z.string(),
  op: z.enum(['set', 'remove']),
});

export const HeaderPredicateSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const MockMatcherSchema = z.object({
  methods: z.array(HttpMethodSchema),
  pattern: z.string(),
  patternKind: z.enum(['glob', 'regex']),
  headerPredicates: z.array(HeaderPredicateSchema),
});

export const MockActionSchema = z.object({
  status: z.number().int().nullable(),
  statusText: z.string(),
  headers: z.array(HeaderOpSchema),
  bodyMode: z.enum(['passthrough', 'literal', 'json']),
  body: z.string(),
  delayMs: z.number().nonnegative(),
  // Поля TASK-023 с `.default` — обратная совместимость: правила, сохранённые/
  // импортированные до появления троттлинга/офлайна, парсятся без потери набора.
  throttleKbps: z.number().positive().nullable().default(null),
  offline: z.boolean().default(false),
});

// Без явного `z.ZodType<MockRule>`-аннотирования: у действия появились поля с
// `.default` (throttleKbps/offline, TASK-023) — вход схемы шире выхода (старый JSON
// без этих полей валиден), поэтому аннотация `ZodType<MockRule,…,MockRule>` больше
// не подходит. Выход (`z.infer`) остаётся ровно `MockRule` — это проверяет
// `satisfies` ниже, не сужая входной тип.
export const MockRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  matcher: MockMatcherSchema,
  action: MockActionSchema,
  once: z.number().int().positive().nullable(),
}) satisfies z.ZodType<MockRule, z.ZodTypeDef, unknown>;

export const MockRuleSetSchema = z.array(MockRuleSchema);

/** Стабильная обёртка набора для экспорта: версия + правила (совместимость вперёд). */
export const RuleSetFileSchema = z.object({
  kind: z.literal('qa-toolbox/mock-rules'),
  version: z.literal(1),
  rules: MockRuleSetSchema,
});

/** Схема сценария (TASK-023): группа ссылок на правила + метаданные. */
export const MockScenarioSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  description: z.string(),
  ruleIds: z.array(z.string()),
});

/**
 * Обёртка сценария для экспорта/импорта: сам сценарий + правила, на которые он
 * ссылается (чтобы импорт был самодостаточным — задел под шаринг, TASK-029/030).
 */
export const ScenarioFileSchema = z.object({
  kind: z.literal('qa-toolbox/mock-scenario'),
  version: z.literal(1),
  scenario: MockScenarioSchema,
  rules: MockRuleSetSchema,
});

/** Генерирует уникальный id правила. */
export function newRuleId(): string {
  return `rule-${crypto.randomUUID()}`;
}

/** Создаёт новое правило с дефолтами (независимые ссылки на matcher/action). */
export function createRule(partial?: Partial<MockRule>): MockRule {
  return {
    id: newRuleId(),
    label: '',
    enabled: true,
    matcher: { ...DEFAULT_MATCHER, methods: [], headerPredicates: [] },
    action: { ...DEFAULT_ACTION, headers: [] },
    once: null,
    ...partial,
  };
}

/** Результат разбора импортируемого набора. */
export type ParseResult = { ok: true; rules: MockRule[] } | { ok: false; error: string };

/**
 * Разбирает JSON набора правил. Принимает как обёртку `{kind, version, rules}`, так
 * и «голый» массив правил (толерантность к ручному вводу). Любая невалидность —
 * `{ ok: false }` с человекочитаемой причиной, без исключения.
 */
export function parseRuleSet(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  const wrapped = RuleSetFileSchema.safeParse(raw);
  if (wrapped.success) return { ok: true, rules: wrapped.data.rules };
  const bare = MockRuleSetSchema.safeParse(raw);
  if (bare.success) return { ok: true, rules: bare.data };
  return { ok: false, error: 'schema-mismatch' };
}

/** Сериализует набор правил в стабильную JSON-обёртку (pretty). */
export function serializeRuleSet(rules: MockRule[]): string {
  return JSON.stringify({ kind: 'qa-toolbox/mock-rules', version: 1, rules }, null, 2);
}

/** Результат разбора импортируемого сценария (сценарий + его правила). */
export type ParseScenarioResult =
  { ok: true; scenario: MockScenario; rules: MockRule[] } | { ok: false; error: string };

/**
 * Разбирает JSON сценария (обёртка `{kind:'qa-toolbox/mock-scenario', …}`). Любая
 * невалидность — `{ ok: false }` с причиной, без исключения (как `parseRuleSet`).
 */
export function parseScenario(json: string): ParseScenarioResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  const parsed = ScenarioFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'schema-mismatch' };
  return { ok: true, scenario: parsed.data.scenario, rules: parsed.data.rules };
}

/** Сериализует сценарий вместе с его правилами в стабильную JSON-обёртку (pretty). */
export function serializeScenario(scenario: MockScenario, rules: MockRule[]): string {
  return JSON.stringify({ kind: 'qa-toolbox/mock-scenario', version: 1, scenario, rules }, null, 2);
}

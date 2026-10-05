/**
 * Сценарии мока (TASK-023) — чистая логика: CRUD-хелперы, нормализация «ровно один
 * активный», резолвер «активный сценарий → плоский набор действующих правил» и
 * пресеты-шаблоны. Без DOM/chrome/Preact.
 *
 * Ментальная модель: правила — единый источник (`state.rules`), сценарий лишь
 * ссылается на них по id. Активный сценарий ПОЛНОСТЬЮ определяет набор действующих
 * правил (членство = включённость); режим «выкл» (activeId=null) возвращает к
 * ручному per-rule `enabled` (обратная совместимость с TASK-022).
 *
 * Инвариант «ровно один активный сценарий» держится структурно (одно поле
 * `activeScenarioId`) и защищается `normalizeActiveScenarioId` (висячий id → null).
 */
import type { MockRule, MockScenario } from './types';
import { createRule } from './rules';

/** Генерирует уникальный id сценария. */
export function newScenarioId(): string {
  return `scn-${crypto.randomUUID()}`;
}

/** Создаёт новый сценарий с дефолтами (независимая ссылка на `ruleIds`). */
export function createScenario(partial?: Partial<MockScenario>): MockScenario {
  return {
    id: newScenarioId(),
    label: '',
    description: '',
    ruleIds: [],
    ...partial,
    // ruleIds всегда независимый массив, даже если пришёл через partial.
    ...(partial?.ruleIds ? { ruleIds: [...partial.ruleIds] } : {}),
  };
}

/**
 * Нормализует id активного сценария: возвращает его, только если такой сценарий
 * существует; иначе null. Так гарантируется, что активным может быть максимум один
 * (и только реально существующий) сценарий.
 */
export function normalizeActiveScenarioId(
  scenarios: MockScenario[],
  activeId: string | null,
): string | null {
  if (activeId === null) return null;
  return scenarios.some((s) => s.id === activeId) ? activeId : null;
}

/**
 * Резолвит действующий набор правил. Активный сценарий → правила, чьи id входят в
 * `scenario.ruleIds` (в порядке общего списка = приоритет; членство важнее per-rule
 * `enabled`). «Выкл» (нет активного/висячий id) → правила с `enabled` (как TASK-022).
 */
export function resolveActiveRules(
  rules: MockRule[],
  scenarios: MockScenario[],
  activeId: string | null,
): MockRule[] {
  const normalized = normalizeActiveScenarioId(scenarios, activeId);
  if (normalized === null) return rules.filter((r) => r.enabled);
  const scenario = scenarios.find((s) => s.id === normalized);
  if (!scenario) return rules.filter((r) => r.enabled);
  const member = new Set(scenario.ruleIds);
  return rules.filter((r) => member.has(r.id));
}

/** Переключает членство правила в сценарии (добавить/убрать), возвращая новый сценарий. */
export function toggleRuleInScenario(scenario: MockScenario, ruleId: string): MockScenario {
  const has = scenario.ruleIds.includes(ruleId);
  return {
    ...scenario,
    ruleIds: has ? scenario.ruleIds.filter((id) => id !== ruleId) : [...scenario.ruleIds, ruleId],
  };
}

/**
 * Убирает из всех сценариев ссылки на удалённое правило (вызывать при удалении
 * правила, чтобы сценарии не держали висячих id).
 */
export function pruneRuleFromScenarios(scenarios: MockScenario[], ruleId: string): MockScenario[] {
  return scenarios.map((s) =>
    s.ruleIds.includes(ruleId) ? { ...s, ruleIds: s.ruleIds.filter((id) => id !== ruleId) } : s,
  );
}

/** Виды пресет-шаблонов сценариев. */
export type ScenarioPresetKind = 'error500' | 'emptyCollection' | 'slowNetwork';

export const SCENARIO_PRESET_KINDS: readonly ScenarioPresetKind[] = [
  'error500',
  'emptyCollection',
  'slowNetwork',
];

/** i18n-ключ метки пресета (резолвится в UI). */
export function presetLabelKey(kind: ScenarioPresetKind): string {
  return `feature.mock.preset.${kind}`;
}

/**
 * Строит пресет-сценарий вместе с его правилами. Возвращает свежие правила (новые
 * id) и сценарий, уже ссылающийся на них — вызывающий добавляет и то, и другое в
 * состояние. Метки правил/сценария — i18n-ключи (UI подставит перевод).
 */
export function buildScenarioPreset(kind: ScenarioPresetKind): {
  scenario: MockScenario;
  rules: MockRule[];
} {
  const labelKey = presetLabelKey(kind);
  let rules: MockRule[];

  switch (kind) {
    case 'error500':
      // Любой /api/* → 500 (короткое замыкание синтетикой).
      rules = [
        createRule({
          label: labelKey,
          matcher: {
            methods: [],
            pattern: '*/api/*',
            patternKind: 'glob',
            headerPredicates: [],
          },
          action: {
            status: 500,
            statusText: 'Internal Server Error',
            headers: [],
            bodyMode: 'json',
            body: '{"error":"emulated 500"}',
            delayMs: 0,
            throttleKbps: null,
            offline: false,
          },
        }),
      ];
      break;
    case 'emptyCollection':
      // Любой /api/* → пустая коллекция.
      rules = [
        createRule({
          label: labelKey,
          matcher: {
            methods: ['GET'],
            pattern: '*/api/*',
            patternKind: 'glob',
            headerPredicates: [],
          },
          action: {
            status: 200,
            statusText: '',
            headers: [],
            bodyMode: 'json',
            body: '[]',
            delayMs: 0,
            throttleKbps: null,
            offline: false,
          },
        }),
      ];
      break;
    case 'slowNetwork':
    default:
      // Любой запрос — реальный ответ, но с троттлингом «медленного 3G».
      rules = [
        createRule({
          label: labelKey,
          matcher: { methods: [], pattern: '*', patternKind: 'glob', headerPredicates: [] },
          action: {
            status: null,
            statusText: '',
            headers: [],
            bodyMode: 'passthrough',
            body: '',
            delayMs: 200,
            throttleKbps: 400,
            offline: false,
          },
        }),
      ];
      break;
  }

  const scenario = createScenario({
    label: labelKey,
    ruleIds: rules.map((r) => r.id),
  });
  return { scenario, rules };
}

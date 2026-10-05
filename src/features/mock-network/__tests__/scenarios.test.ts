import { describe, it, expect } from 'vitest';
import {
  SCENARIO_PRESET_KINDS,
  buildScenarioPreset,
  createScenario,
  normalizeActiveScenarioId,
  presetLabelKey,
  pruneRuleFromScenarios,
  resolveActiveRules,
  toggleRuleInScenario,
} from '../scenarios';
import { makeRule } from './fixtures/requests';

describe('createScenario', () => {
  it('дефолты + независимая ссылка на ruleIds', () => {
    const src = ['a', 'b'];
    const s = createScenario({ label: 'L', ruleIds: src });
    expect(s.label).toBe('L');
    expect(s.ruleIds).toEqual(['a', 'b']);
    src.push('c');
    expect(s.ruleIds).toEqual(['a', 'b']); // копия, не ссылка
    expect(s.id).toMatch(/^scn-/);
  });
});

describe('normalizeActiveScenarioId', () => {
  const scenarios = [createScenario({ id: 's1' }), createScenario({ id: 's2' })];

  it('null остаётся null', () => {
    expect(normalizeActiveScenarioId(scenarios, null)).toBeNull();
  });

  it('существующий id сохраняется', () => {
    expect(normalizeActiveScenarioId(scenarios, 's2')).toBe('s2');
  });

  it('висячий id → null (инвариант «ровно один существующий активный»)', () => {
    expect(normalizeActiveScenarioId(scenarios, 'ghost')).toBeNull();
  });
});

describe('resolveActiveRules', () => {
  const r1 = makeRule({ id: 'r1', enabled: true });
  const r2 = makeRule({ id: 'r2', enabled: false });
  const r3 = makeRule({ id: 'r3', enabled: true });
  const rules = [r1, r2, r3];

  it('выкл (activeId=null) → правила по per-rule enabled', () => {
    expect(resolveActiveRules(rules, [], null).map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('активный сценарий → членство (важнее enabled), порядок из общего списка', () => {
    const scn = createScenario({ id: 'scn', ruleIds: ['r3', 'r2'] });
    // r2 выключен per-rule, но входит в сценарий → активен; порядок по rules (r2 перед r3).
    expect(resolveActiveRules(rules, [scn], 'scn').map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('висячий activeId → откат к per-rule enabled', () => {
    expect(resolveActiveRules(rules, [], 'ghost').map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('сценарий со ссылкой на несуществующее правило игнорирует её', () => {
    const scn = createScenario({ id: 'scn', ruleIds: ['r1', 'gone'] });
    expect(resolveActiveRules(rules, [scn], 'scn').map((r) => r.id)).toEqual(['r1']);
  });
});

describe('toggleRuleInScenario / pruneRuleFromScenarios', () => {
  it('toggle добавляет и убирает членство', () => {
    let scn = createScenario({ id: 's', ruleIds: ['a'] });
    scn = toggleRuleInScenario(scn, 'b');
    expect(scn.ruleIds).toEqual(['a', 'b']);
    scn = toggleRuleInScenario(scn, 'a');
    expect(scn.ruleIds).toEqual(['b']);
  });

  it('prune убирает удалённое правило из всех сценариев', () => {
    const scenarios = [
      createScenario({ id: 's1', ruleIds: ['a', 'b'] }),
      createScenario({ id: 's2', ruleIds: ['c'] }),
    ];
    const out = pruneRuleFromScenarios(scenarios, 'b');
    expect(out[0]?.ruleIds).toEqual(['a']);
    expect(out[1]?.ruleIds).toEqual(['c']); // не тронут
  });
});

describe('пресеты сценариев', () => {
  it('presetLabelKey', () => {
    expect(presetLabelKey('error500')).toBe('feature.mock.preset.error500');
  });

  it('каждый пресет строит сценарий, ссылающийся на свои правила', () => {
    for (const kind of SCENARIO_PRESET_KINDS) {
      const { scenario, rules } = buildScenarioPreset(kind);
      expect(rules.length).toBeGreaterThan(0);
      expect(scenario.ruleIds).toEqual(rules.map((r) => r.id));
      // Правила пресета резолвятся сценарием как активные.
      expect(resolveActiveRules(rules, [scenario], scenario.id).map((r) => r.id)).toEqual(
        rules.map((r) => r.id),
      );
    }
  });

  it('error500 → синтетический 500 на /api/*', () => {
    const { rules } = buildScenarioPreset('error500');
    expect(rules[0]?.action.status).toBe(500);
    expect(rules[0]?.matcher.pattern).toContain('/api/');
  });

  it('slowNetwork → passthrough с троттлингом', () => {
    const { rules } = buildScenarioPreset('slowNetwork');
    expect(rules[0]?.action.bodyMode).toBe('passthrough');
    expect(rules[0]?.action.throttleKbps).toBeGreaterThan(0);
  });
});

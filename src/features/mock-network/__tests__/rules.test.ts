import { describe, it, expect } from 'vitest';
import { createRule, newRuleId, parseRuleSet, serializeRuleSet, MockRuleSchema } from '../rules';

describe('createRule / newRuleId', () => {
  it('создаёт валидное правило с дефолтами и уникальным id', () => {
    const a = createRule();
    const b = createRule();
    expect(a.id).not.toBe(b.id);
    expect(MockRuleSchema.safeParse(a).success).toBe(true);
    expect(a.enabled).toBe(true);
    expect(a.matcher.methods).toEqual([]);
  });

  it('newRuleId имеет префикс', () => {
    expect(newRuleId()).toMatch(/^rule-/);
  });

  it('переопределения применяются, ссылки независимы', () => {
    const r = createRule({ label: 'x' });
    expect(r.label).toBe('x');
    r.matcher.methods.push('GET');
    expect(createRule().matcher.methods).toEqual([]);
  });
});

describe('parseRuleSet / serializeRuleSet — обратимость', () => {
  it('экспорт → импорт восстанавливает набор', () => {
    const rules = [createRule({ label: 'a' }), createRule({ label: 'b' })];
    const json = serializeRuleSet(rules);
    const parsed = parseRuleSet(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.rules.map((r) => r.label)).toEqual(['a', 'b']);
  });

  it('принимает «голый» массив правил', () => {
    const rules = [createRule()];
    const parsed = parseRuleSet(JSON.stringify(rules));
    expect(parsed.ok).toBe(true);
  });

  it('битый JSON → invalid-json', () => {
    const parsed = parseRuleSet('{not json');
    expect(parsed).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('несоответствие схеме → schema-mismatch', () => {
    const parsed = parseRuleSet(JSON.stringify({ kind: 'wrong', version: 1, rules: [] }));
    expect(parsed).toEqual({ ok: false, error: 'schema-mismatch' });
  });

  it('массив с невалидным правилом → schema-mismatch', () => {
    const parsed = parseRuleSet(JSON.stringify([{ id: '', label: 1 }]));
    expect(parsed).toEqual({ ok: false, error: 'schema-mismatch' });
  });
});

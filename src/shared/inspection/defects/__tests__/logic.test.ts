import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFECT_RULES,
  DEFECT_RULES_BY_ID,
  buildContext,
  buildReport,
  detectDefects,
  groupFindings,
  severityRank,
  summarize,
  toReportRows,
} from '../logic';
import type { DefectContext, DefectRule } from '../logic';
import type { DefectFinding } from '../types';
import { makeNode, resetNodeIndex } from './fixtures/defects';

beforeEach(() => {
  resetNodeIndex();
});

/** Прогоняет один предикат правила по узлу с пустым (или заданным) контекстом. */
function fire(
  ruleId: string,
  node: Parameters<DefectRule['predicate']>[0],
  ctx?: DefectContext,
): boolean {
  const rule = DEFECT_RULES_BY_ID.get(ruleId);
  if (rule === undefined) throw new Error(`unknown rule ${ruleId}`);
  const context: DefectContext = ctx ?? {
    duplicateIds: new Set(),
    duplicateTestIds: new Set(),
    headingOrderViolations: new Set(),
  };
  return rule.predicate(node, context);
}

describe('registry integrity', () => {
  it('exposes unique rule ids and a matching lookup map', () => {
    const ids = DEFECT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFECT_RULES_BY_ID.size).toBe(DEFECT_RULES.length);
    for (const rule of DEFECT_RULES) {
      expect(DEFECT_RULES_BY_ID.get(rule.id)).toBe(rule);
      expect(rule.messageKey.startsWith('defect.rule.')).toBe(true);
    }
  });
});

describe('rule: img-alt', () => {
  it('flags an img with no alt attribute', () => {
    expect(fire('img-alt', makeNode({ tag: 'img', attrs: { src: 'a.png' } }))).toBe(true);
  });
  it('flags an img with an empty alt', () => {
    expect(fire('img-alt', makeNode({ tag: 'img', attrs: { src: 'a.png', alt: '  ' } }))).toBe(
      true,
    );
  });
  it('passes an img with meaningful alt', () => {
    expect(fire('img-alt', makeNode({ tag: 'img', attrs: { alt: 'logo' } }))).toBe(false);
  });
  it('ignores decorative images (role=presentation / none / aria-hidden)', () => {
    expect(fire('img-alt', makeNode({ tag: 'img', role: 'presentation', attrs: {} }))).toBe(false);
    expect(fire('img-alt', makeNode({ tag: 'img', role: 'none', attrs: {} }))).toBe(false);
    expect(fire('img-alt', makeNode({ tag: 'img', attrs: { 'aria-hidden': 'true' } }))).toBe(false);
  });
  it('ignores non-img nodes', () => {
    expect(fire('img-alt', makeNode({ tag: 'div' }))).toBe(false);
  });
});

describe('rule: img-broken', () => {
  it('flags an img with a src and zero natural width', () => {
    expect(
      fire('img-broken', makeNode({ tag: 'img', naturalWidthZero: true, attrs: { src: 'x.png' } })),
    ).toBe(true);
  });
  it('does not flag a srcless zero-width img (handled by img-alt, not broken)', () => {
    expect(fire('img-broken', makeNode({ tag: 'img', naturalWidthZero: true, attrs: {} }))).toBe(
      false,
    );
  });
  it('does not flag a loaded img', () => {
    expect(
      fire(
        'img-broken',
        makeNode({ tag: 'img', naturalWidthZero: false, attrs: { src: 'x.png' } }),
      ),
    ).toBe(false);
  });
});

describe('rule: button-no-name', () => {
  it('flags a nameless <button>', () => {
    expect(fire('button-no-name', makeNode({ tag: 'button', accessibleNameHint: '' }))).toBe(true);
  });
  it('passes a named <button>', () => {
    expect(fire('button-no-name', makeNode({ tag: 'button', accessibleNameHint: 'Save' }))).toBe(
      false,
    );
  });
  it('flags a nameless role=button', () => {
    expect(fire('button-no-name', makeNode({ tag: 'div', role: 'button' }))).toBe(true);
  });
  it('flags a nameless input button/submit/reset', () => {
    expect(fire('button-no-name', makeNode({ tag: 'input', attrs: { type: 'submit' } }))).toBe(
      true,
    );
    expect(fire('button-no-name', makeNode({ tag: 'input', attrs: { type: 'button' } }))).toBe(
      true,
    );
    expect(fire('button-no-name', makeNode({ tag: 'input', attrs: { type: 'reset' } }))).toBe(true);
  });
  it('ignores non-button inputs and other elements', () => {
    expect(fire('button-no-name', makeNode({ tag: 'input', attrs: { type: 'text' } }))).toBe(false);
    expect(fire('button-no-name', makeNode({ tag: 'span' }))).toBe(false);
  });
});

describe('rule: id-duplicate', () => {
  it('flags a node whose id is in the duplicate set', () => {
    const ctx: DefectContext = {
      duplicateIds: new Set(['dup']),
      duplicateTestIds: new Set(),
      headingOrderViolations: new Set(),
    };
    expect(fire('id-duplicate', makeNode({ attrs: { id: 'dup' } }), ctx)).toBe(true);
    expect(fire('id-duplicate', makeNode({ attrs: { id: 'unique' } }), ctx)).toBe(false);
    expect(fire('id-duplicate', makeNode({ attrs: {} }), ctx)).toBe(false);
  });
});

describe('rule: testid-empty / testid-duplicate', () => {
  it('flags an empty data-testid', () => {
    expect(fire('testid-empty', makeNode({ attrs: { 'data-testid': '' } }))).toBe(true);
    expect(fire('testid-empty', makeNode({ attrs: { 'data-testid': 'ok' } }))).toBe(false);
    expect(fire('testid-empty', makeNode({ attrs: {} }))).toBe(false);
  });
  it('flags a duplicated data-testid', () => {
    const ctx: DefectContext = {
      duplicateIds: new Set(),
      duplicateTestIds: new Set(['row']),
      headingOrderViolations: new Set(),
    };
    expect(fire('testid-duplicate', makeNode({ attrs: { 'data-testid': 'row' } }), ctx)).toBe(true);
    expect(fire('testid-duplicate', makeNode({ attrs: { 'data-testid': 'x' } }), ctx)).toBe(false);
    expect(fire('testid-duplicate', makeNode({ attrs: {} }), ctx)).toBe(false);
  });
});

describe('rule: links', () => {
  it('link-no-href flags an anchor without href', () => {
    expect(fire('link-no-href', makeNode({ tag: 'a', attrs: {} }))).toBe(true);
    expect(fire('link-no-href', makeNode({ tag: 'a', attrs: { href: '/x' } }))).toBe(false);
    expect(fire('link-no-href', makeNode({ tag: 'span', attrs: {} }))).toBe(false);
  });
  it('link-js-void flags javascript: hrefs', () => {
    expect(
      fire('link-js-void', makeNode({ tag: 'a', attrs: { href: 'javascript:void(0)' } })),
    ).toBe(true);
    expect(
      fire('link-js-void', makeNode({ tag: 'a', attrs: { href: 'JavaScript:alert(1)' } })),
    ).toBe(true);
    expect(fire('link-js-void', makeNode({ tag: 'a', attrs: { href: '/x' } }))).toBe(false);
  });
  it('link-hash flags an empty fragment', () => {
    expect(fire('link-hash', makeNode({ tag: 'a', attrs: { href: '#' } }))).toBe(true);
    expect(fire('link-hash', makeNode({ tag: 'a', attrs: { href: '#section' } }))).toBe(false);
  });
});

describe('rule: heading-order', () => {
  it('flags a heading whose index is in the violation set', () => {
    const ctx: DefectContext = {
      duplicateIds: new Set(),
      duplicateTestIds: new Set(),
      headingOrderViolations: new Set([3]),
    };
    expect(fire('heading-order', makeNode({ tag: 'h3', headingLevel: 3, index: 3 }), ctx)).toBe(
      true,
    );
    expect(fire('heading-order', makeNode({ tag: 'h2', headingLevel: 2, index: 1 }), ctx)).toBe(
      false,
    );
    expect(fire('heading-order', makeNode({ tag: 'div', index: 3 }), ctx)).toBe(false);
  });
});

describe('buildContext', () => {
  it('detects duplicate ids and testids, ignoring uniques and blanks', () => {
    const ctx = buildContext([
      makeNode({ attrs: { id: 'a', 'data-testid': 'row' } }),
      makeNode({ attrs: { id: 'a', 'data-testid': 'row' } }),
      makeNode({ attrs: { id: 'b', 'data-testid': 'other' } }),
      makeNode({ attrs: { id: '  ', 'data-testid': '' } }),
    ]);
    expect([...ctx.duplicateIds]).toEqual(['a']);
    expect([...ctx.duplicateTestIds]).toEqual(['row']);
  });

  it('flags heading level jumps (h1 → h3) but not ordered sequences', () => {
    const ctx = buildContext([
      makeNode({ tag: 'h1', headingLevel: 1, index: 0 }),
      makeNode({ tag: 'h3', headingLevel: 3, index: 1 }), // jump: 3 > 1 + 1
      makeNode({ tag: 'h4', headingLevel: 4, index: 2 }), // ok: 4 <= 3 + 1
    ]);
    expect([...ctx.headingOrderViolations]).toEqual([1]);
  });

  it('treats a first heading below h1 as a jump (baseline 0)', () => {
    const ctx = buildContext([makeNode({ tag: 'h2', headingLevel: 2, index: 0 })]);
    expect([...ctx.headingOrderViolations]).toEqual([0]);
  });
});

describe('detectDefects', () => {
  it('runs every enabled rule across the node set', () => {
    const nodes = [
      makeNode({ tag: 'img', attrs: { src: 'a.png' }, selector: 'img.hero' }), // img-alt
      makeNode({ tag: 'a', attrs: { href: '#' }, selector: 'a.top' }), // link-hash
      makeNode({ tag: 'button', accessibleNameHint: '', selector: 'button.x' }), // button-no-name
    ];
    const findings = detectDefects(nodes);
    const ids = findings.map((f) => f.ruleId).sort();
    expect(ids).toEqual(['button-no-name', 'img-alt', 'link-hash']);
  });

  it('skips disabled rules', () => {
    const nodes = [makeNode({ tag: 'img', attrs: { src: 'a.png' } })];
    const findings = detectDefects(nodes, { disabled: new Set(['img-alt']) });
    expect(findings).toHaveLength(0);
  });

  it('detects cross-node duplicates end to end', () => {
    const nodes = [
      makeNode({ attrs: { id: 'dup' }, selector: '#dup-1' }),
      makeNode({ attrs: { id: 'dup' }, selector: '#dup-2' }),
    ];
    const findings = detectDefects(nodes).filter((f) => f.ruleId === 'id-duplicate');
    expect(findings).toHaveLength(2);
    expect(findings[0]?.snippet).toBe('dup');
  });

  it('builds snippets from href, testid and accessible name', () => {
    const nodes = [
      makeNode({ tag: 'a', attrs: {}, accessibleNameHint: 'Home', selector: 'a.home' }), // no href → name
      makeNode({ tag: 'a', attrs: { href: '#' }, selector: 'a.top' }), // href snippet
      makeNode({ tag: 'button', accessibleNameHint: '', selector: 'button.x' }), // '' name snippet
    ];
    const byRule = new Map(detectDefects(nodes).map((f) => [f.ruleId, f.snippet]));
    expect(byRule.get('link-no-href')).toBe('Home');
    expect(byRule.get('link-hash')).toBe('#');
    expect(byRule.get('button-no-name')).toBe('');
  });

  it('falls back to accessible name when testid snippet requested on empty', () => {
    const nodes = [makeNode({ attrs: { 'data-testid': '' }, selector: 'div.empty' })];
    const findings = detectDefects(nodes);
    expect(findings[0]?.snippet).toBe('');
  });
});

describe('severityRank', () => {
  it('ranks error < warning < info', () => {
    expect(severityRank('error')).toBeLessThan(severityRank('warning'));
    expect(severityRank('warning')).toBeLessThan(severityRank('info'));
  });
});

describe('groupFindings', () => {
  const finding = (over: Partial<DefectFinding>): DefectFinding => ({
    ruleId: 'r',
    severity: 'warning',
    messageKey: 'defect.rule.r',
    selector: 's',
    tag: 'div',
    snippet: '',
    ...over,
  });

  it('groups by rule and sorts by severity, then count, then id', () => {
    const groups = groupFindings([
      finding({ ruleId: 'warn-b', severity: 'warning', messageKey: 'k1' }),
      finding({ ruleId: 'warn-a', severity: 'warning', messageKey: 'k2' }),
      finding({ ruleId: 'warn-a', severity: 'warning', messageKey: 'k2' }),
      finding({ ruleId: 'err', severity: 'error', messageKey: 'k3' }),
      finding({ ruleId: 'info', severity: 'info', messageKey: 'k4' }),
    ]);
    expect(groups.map((g) => g.ruleId)).toEqual(['err', 'warn-a', 'warn-b', 'info']);
    expect(groups[0]).toMatchObject({
      ruleId: 'err',
      severity: 'error',
      count: 1,
      messageKey: 'k3',
    });
    expect(groups[1]?.count).toBe(2);
  });

  it('returns an empty array for no findings', () => {
    expect(groupFindings([])).toEqual([]);
  });
});

describe('summarize', () => {
  it('counts findings per severity', () => {
    const findings: DefectFinding[] = [
      { ruleId: 'a', severity: 'error', messageKey: 'k', selector: 's', tag: 't', snippet: '' },
      { ruleId: 'b', severity: 'warning', messageKey: 'k', selector: 's', tag: 't', snippet: '' },
      { ruleId: 'c', severity: 'info', messageKey: 'k', selector: 's', tag: 't', snippet: '' },
      { ruleId: 'd', severity: 'error', messageKey: 'k', selector: 's', tag: 't', snippet: '' },
    ];
    expect(summarize(findings)).toEqual({ total: 4, errors: 2, warnings: 1, infos: 1 });
    expect(summarize([])).toEqual({ total: 0, errors: 0, warnings: 0, infos: 0 });
  });
});

describe('report', () => {
  const findings: DefectFinding[] = [
    {
      ruleId: 'img-alt',
      severity: 'error',
      messageKey: 'defect.rule.imgAlt',
      selector: 'img.hero',
      tag: 'img',
      snippet: '',
    },
    {
      ruleId: 'testid-empty',
      severity: 'warning',
      messageKey: 'defect.rule.testidEmpty',
      selector: 'div.cell',
      tag: 'div',
      snippet: '=danger,inject',
    },
  ];
  const rows = toReportRows(findings);

  it('projects findings into flat rows', () => {
    expect(rows[0]).toEqual({
      rule: 'img-alt',
      severity: 'error',
      selector: 'img.hero',
      tag: 'img',
      snippet: '',
    });
  });

  it('builds JSON with preserved structure', () => {
    const parsed = JSON.parse(buildReport(rows, 'json')) as { rule: string }[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.rule).toBe('img-alt');
  });

  it('builds CSV with header and anti-injection escaping', () => {
    const csv = buildReport(rows, 'csv');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('rule,severity,selector,tag,snippet');
    expect(csv).toContain('"\'=danger,inject"');
    expect(lines).toHaveLength(3);
  });

  it('builds plain text with one line per finding', () => {
    expect(buildReport(rows, 'plain')).toBe(
      'error img.hero — img-alt\nwarning div.cell — testid-empty',
    );
  });

  it('returns just the header for an empty CSV report', () => {
    expect(buildReport([], 'csv')).toBe('rule,severity,selector,tag,snippet');
  });
});

/**
 * Юниты сборщика matched CSS rules (TASK-055): совпадения и только они,
 * детерминированный порядок, учёт `@media`/`@supports` по применимости, inline-`style`
 * как origin `inline`, инверсия победителя на `!important`, атрибуция `propertySources`,
 * пометка перекрытых объявлений `winning:false`, честная деградация на cross-origin
 * (`SecurityError` → `unreadableSheets`) и пропуск невалидного селектора. Матч делает
 * реальный `element.matches` (jsdom); таблицы стилей — фейковые с инъекцией источников.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { collectMatchedRules } from '@/shared/inspection/rules/collector';
import type { RulesDeps } from '@/shared/inspection/rules/collector';
import { parseMatchedRules } from '@/shared/inspection/rules/types';

/** Фейковая `CSSStyleDeclaration`: значения вида `'red'` или `'red !important'`. */
function decl(props: Record<string, string>): CSSStyleDeclaration {
  const map = new Map<string, { value: string; important: boolean }>();
  for (const [prop, raw] of Object.entries(props)) {
    const important = /!important\s*$/.test(raw);
    map.set(prop, { value: raw.replace(/!important\s*$/, '').trim(), important });
  }
  return {
    getPropertyValue: (p: string) => map.get(p)?.value ?? '',
    getPropertyPriority: (p: string) => (map.get(p)?.important === true ? 'important' : ''),
  } as unknown as CSSStyleDeclaration;
}

function styleRule(selectorText: string, props: Record<string, string>): CSSRule {
  return { selectorText, style: decl(props) } as unknown as CSSRule;
}

function mediaRule(mediaText: string, rules: CSSRule[]): CSSRule {
  return { media: { mediaText }, cssRules: asList(rules) } as unknown as CSSRule;
}

function supportsRule(conditionText: string, rules: CSSRule[]): CSSRule {
  return { conditionText, cssRules: asList(rules) } as unknown as CSSRule;
}

function layerRule(name: string, rules: CSSRule[]): CSSRule {
  return { name, cssRules: asList(rules) } as unknown as CSSRule;
}

function asList(rules: CSSRule[]): CSSRuleList {
  return rules as unknown as CSSRuleList;
}

function sheet(href: string | null, rules: CSSRule[]): CSSStyleSheet {
  return { href, cssRules: asList(rules) } as unknown as CSSStyleSheet;
}

/** Лист, чтение `cssRules` которого бросает (cross-origin без CORS). */
function unreadableSheet(): CSSStyleSheet {
  const s = { href: 'https://cdn.example.com/app.css' } as Record<string, unknown>;
  Object.defineProperty(s, 'cssRules', {
    get() {
      throw new DOMException('Cannot access rules', 'SecurityError');
    },
  });
  return s as unknown as CSSStyleSheet;
}

function deps(sheets: CSSStyleSheet[], over: Partial<RulesDeps> = {}): RulesDeps {
  return {
    getStyleSheets: () => sheets,
    mediaMatches: () => true,
    supports: () => true,
    ...over,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

function button(): HTMLElement {
  const el = document.createElement('button');
  el.id = 'go';
  el.className = 'btn primary';
  document.body.appendChild(el);
  return el;
}

describe('collectMatchedRules', () => {
  it('returns only rules whose selector matches the node', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([
        sheet(null, [
          styleRule('.btn', { color: 'red' }),
          styleRule('.nope', { color: 'blue' }),
          styleRule('#go', { color: 'green' }),
        ]),
      ]),
    );
    const selectors = out.rules.map((r) => r.selectorText);
    expect(selectors).toContain('.btn');
    expect(selectors).toContain('#go');
    expect(selectors).not.toContain('.nope');
    expect(out.rules).toHaveLength(2);
  });

  it('orders rules by descending cascade priority (most specific first)', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([
        sheet(null, [styleRule('.btn', { color: 'red' }), styleRule('#go', { color: 'green' })]),
      ]),
    );
    // #go (1,0,0) выше .btn (0,1,0).
    expect(out.rules[0]?.selectorText).toBe('#go');
    expect(out.rules[1]?.selectorText).toBe('.btn');
  });

  it('attributes the winning declaration and strikes the overridden one', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([
        sheet(null, [styleRule('.btn', { color: 'red' }), styleRule('#go', { color: 'green' })]),
      ]),
    );
    // #id специфичнее — побеждает `color: green`.
    expect(out.propertySources.color?.selectorText).toBe('#go');
    const idRule = out.rules.find((r) => r.selectorText === '#go');
    const clsRule = out.rules.find((r) => r.selectorText === '.btn');
    expect(idRule?.declarations.find((d) => d.property === 'color')?.winning).toBe(true);
    expect(clsRule?.declarations.find((d) => d.property === 'color')?.winning).toBe(false);
  });

  it('lets author !important invert specificity order', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([
        sheet(null, [
          styleRule('.btn', { color: 'red !important' }),
          styleRule('#go', { color: 'green' }),
        ]),
      ]),
    );
    // despite #id being more specific, !important on .btn wins.
    expect(out.propertySources.color?.selectorText).toBe('.btn');
    expect(out.propertySources.color?.important).toBe(true);
  });

  it('includes inline style as an origin:inline rule that beats normal author rules', () => {
    const el = button();
    el.style.color = 'black';
    const out = collectMatchedRules(
      el,
      deps([sheet(null, [styleRule('#go', { color: 'green' })])]),
    );
    const inline = out.rules.find((r) => r.origin === 'inline');
    expect(inline).toBeDefined();
    expect(inline?.source).toBe('<inline>');
    // Inline (origin) wins over a normal author rule even one with an id selector.
    expect(out.propertySources.color?.origin).toBe('inline');
  });

  it('lets author !important beat inline (non-important)', () => {
    const el = button();
    el.style.color = 'black';
    const out = collectMatchedRules(
      el,
      deps([sheet(null, [styleRule('.btn', { color: 'red !important' })])]),
    );
    expect(out.propertySources.color?.origin).toBe('author');
    expect(out.propertySources.color?.important).toBe(true);
  });

  it('counts a @media rule only when it applies', () => {
    const el = button();
    const sheets = [
      sheet(null, [mediaRule('(min-width: 100px)', [styleRule('.btn', { color: 'teal' })])]),
    ];

    const applied = collectMatchedRules(el, deps(sheets, { mediaMatches: () => true }));
    expect(applied.rules.some((r) => r.selectorText === '.btn')).toBe(true);
    expect(applied.rules[0]?.media).toBe('@media (min-width: 100px)');

    const skipped = collectMatchedRules(el, deps(sheets, { mediaMatches: () => false }));
    expect(skipped.rules.some((r) => r.selectorText === '.btn')).toBe(false);
  });

  it('counts a @supports rule only when the condition holds', () => {
    const el = button();
    const sheets = [
      sheet(null, [supportsRule('(display: grid)', [styleRule('.btn', { display: 'grid' })])]),
    ];
    expect(collectMatchedRules(el, deps(sheets, { supports: () => true })).rules).toHaveLength(1);
    expect(collectMatchedRules(el, deps(sheets, { supports: () => false })).rules).toHaveLength(0);
  });

  it('carries the @layer name as context', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([sheet(null, [layerRule('components', [styleRule('.btn', { color: 'red' })])])]),
    );
    expect(out.rules[0]?.layer).toBe('components');
  });

  it('records the stylesheet href as the rule source', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([sheet('https://example.com/app.css', [styleRule('.btn', { color: 'red' })])]),
    );
    expect(out.rules[0]?.source).toBe('https://example.com/app.css');
  });

  it('counts cross-origin sheets as unreadable and keeps collecting', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([unreadableSheet(), sheet(null, [styleRule('.btn', { color: 'red' })])]),
    );
    expect(out.unreadableSheets).toBe(1);
    expect(out.rules.some((r) => r.selectorText === '.btn')).toBe(true);
  });

  it('skips an invalid selector without crashing', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([
        sheet(null, [
          styleRule(':::broken(', { color: 'red' }),
          styleRule('.btn', { color: 'blue' }),
        ]),
      ]),
    );
    expect(out.rules.map((r) => r.selectorText)).toEqual(['.btn']);
  });

  it('only extracts curated catalog properties (privacy: no arbitrary declarations)', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([
        sheet(null, [styleRule('.btn', { color: 'red', '--secret-token': 'abc', content: '"x"' })]),
      ]),
    );
    const props = out.rules[0]?.declarations.map((d) => d.property) ?? [];
    expect(props).toContain('color');
    expect(props).not.toContain('--secret-token');
    expect(props).not.toContain('content');
  });

  it('produces an empty, valid result when nothing matches', () => {
    const el = button();
    const out = collectMatchedRules(
      el,
      deps([sheet(null, [styleRule('.nope', { color: 'red' })])]),
    );
    expect(out.rules).toEqual([]);
    expect(out.propertySources).toEqual({});
    expect(out.unreadableSheets).toBe(0);
    expect(out.truncated).toBe(false);
  });

  it('produces JSON-serializable output validated by the schema', () => {
    const el = button();
    el.style.color = 'black';
    const out = collectMatchedRules(
      el,
      deps([sheet(null, [styleRule('.btn', { color: 'red', 'font-size': '14px' })])]),
    );
    const roundTripped: unknown = JSON.parse(JSON.stringify(out));
    expect(parseMatchedRules(roundTripped)).not.toBeNull();
  });
});

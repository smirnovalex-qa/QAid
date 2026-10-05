/**
 * Юниты расчёта специфичности (TASK-055): кортежи `(a, b, c)` для id/класса/типа/
 * атрибута/псевдоклассов/псевдоэлементов, универсального `*`, функциональных
 * `:not()/:is()/:where()`, списков селекторов, и корректность упорядочивания.
 */
import { describe, expect, it } from 'vitest';
import {
  compareSpecificity,
  computeSpecificity,
  splitSelectorList,
} from '@/shared/inspection/rules/specificity';

describe('computeSpecificity', () => {
  it('counts id selectors into a', () => {
    expect(computeSpecificity('#app')).toEqual([1, 0, 0]);
    expect(computeSpecificity('#a #b')).toEqual([2, 0, 0]);
  });

  it('counts classes, attributes and pseudo-classes into b', () => {
    expect(computeSpecificity('.btn')).toEqual([0, 1, 0]);
    expect(computeSpecificity('[type="text"]')).toEqual([0, 1, 0]);
    expect(computeSpecificity(':hover')).toEqual([0, 1, 0]);
    expect(computeSpecificity('.btn.btn--ghost')).toEqual([0, 2, 0]);
    expect(computeSpecificity('a[href][data-x]:focus')).toEqual([0, 3, 1]);
  });

  it('counts types and pseudo-elements into c', () => {
    expect(computeSpecificity('div')).toEqual([0, 0, 1]);
    expect(computeSpecificity('ul li')).toEqual([0, 0, 2]);
    expect(computeSpecificity('div::before')).toEqual([0, 0, 2]);
    // Legacy single-colon pseudo-elements still count as c.
    expect(computeSpecificity('p:before')).toEqual([0, 0, 2]);
  });

  it('treats the universal selector as zero', () => {
    expect(computeSpecificity('*')).toEqual([0, 0, 0]);
    expect(computeSpecificity('* + *')).toEqual([0, 0, 0]);
    expect(computeSpecificity('*.btn')).toEqual([0, 1, 0]);
  });

  it('combines a full compound selector', () => {
    // #id .class .class type → (1, 2, 1)
    expect(computeSpecificity('#nav .item .item a')).toEqual([1, 2, 1]);
    expect(computeSpecificity('#id.cls:hover::after')).toEqual([1, 2, 1]);
  });

  it(':not()/:is()/:has() take the most specific argument', () => {
    expect(computeSpecificity(':not(#id)')).toEqual([1, 0, 0]);
    expect(computeSpecificity(':is(.a, #b, div)')).toEqual([1, 0, 0]);
    expect(computeSpecificity('a:not(.disabled)')).toEqual([0, 1, 1]);
    expect(computeSpecificity(':has(> .child)')).toEqual([0, 1, 0]);
  });

  it(':where() always contributes zero', () => {
    expect(computeSpecificity(':where(#a, .b, div)')).toEqual([0, 0, 0]);
    expect(computeSpecificity('.card:where(#x)')).toEqual([0, 1, 0]);
  });

  it('takes the most specific part of a selector list', () => {
    // `a, #b, .c` → the #b part dominates.
    expect(computeSpecificity('a, #b, .c')).toEqual([1, 0, 0]);
  });

  it('ignores combinators and whitespace', () => {
    expect(computeSpecificity('.a > .b + .c ~ .d')).toEqual([0, 4, 0]);
  });

  it('handles namespaced type selectors (prefix does not count)', () => {
    expect(computeSpecificity('svg|rect')).toEqual([0, 0, 1]);
    expect(computeSpecificity('*|div')).toEqual([0, 0, 1]);
  });

  it('does not throw on exotic/unknown input (ordering heuristic only)', () => {
    expect(() => computeSpecificity(':nth-child(2n of .foo)')).not.toThrow();
    expect(() => computeSpecificity('::highlight(custom)')).not.toThrow();
    expect(() => computeSpecificity('')).not.toThrow();
    expect(computeSpecificity('')).toEqual([0, 0, 0]);
  });

  it('skips stray/unknown characters without miscounting', () => {
    // `%` is not a valid token — it is skipped, the class still counts.
    expect(computeSpecificity('.a % .b')).toEqual([0, 2, 0]);
  });

  it('handles escaped characters inside class names', () => {
    // `\.` escapes the dot — one class selector, not two.
    expect(computeSpecificity('.foo\\.bar')).toEqual([0, 1, 0]);
  });
});

describe('compareSpecificity', () => {
  it('orders by a, then b, then c', () => {
    expect(compareSpecificity([1, 0, 0], [0, 9, 9])).toBeGreaterThan(0);
    expect(compareSpecificity([0, 1, 0], [0, 1, 5])).toBeLessThan(0);
    expect(compareSpecificity([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe('splitSelectorList', () => {
  it('splits top-level commas, respecting parens and brackets', () => {
    expect(splitSelectorList('a, .b, #c')).toEqual(['a', '.b', '#c']);
    expect(splitSelectorList(':is(a, b), .c')).toEqual([':is(a, b)', '.c']);
    expect(splitSelectorList('[data-x="a,b"], .c')).toEqual(['[data-x="a,b"]', '.c']);
  });

  it('drops empty parts', () => {
    expect(splitSelectorList('a,, .b,')).toEqual(['a', '.b']);
  });

  it('keeps an escaped comma inside a single selector', () => {
    expect(splitSelectorList('.a\\,b, .c')).toEqual(['.a\\,b', '.c']);
  });
});

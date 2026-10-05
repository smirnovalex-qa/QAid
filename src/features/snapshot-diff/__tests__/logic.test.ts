import { describe, expect, it } from 'vitest';
import {
  buildDiffReport,
  diffSnapshots,
  isEmptyDiff,
  selectChanges,
  toJSONReport,
  toMarkdownReport,
} from '../logic';
import { snapshot } from './fixtures/snapshots';

describe('diffSnapshots', () => {
  it('reports no changes for identical snapshots', () => {
    const a = snapshot([
      { key: 'testid=a', tag: 'div', text: 'x', styles: { color: 'red' } },
      { key: 'testid=b', tag: 'span', text: 'y' },
    ]);
    const b = snapshot([
      { key: 'testid=a', tag: 'div', text: 'x', styles: { color: 'red' } },
      { key: 'testid=b', tag: 'span', text: 'y' },
    ]);
    const diff = diffSnapshots(a, b);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.summary).toMatchObject({ added: 0, removed: 0, changed: 0 });
  });

  it('classifies added and removed nodes by key', () => {
    const a = snapshot([{ key: 'testid=keep' }, { key: 'testid=gone' }]);
    const b = snapshot([{ key: 'testid=keep' }, { key: 'testid=new' }]);
    const diff = diffSnapshots(a, b);
    expect(diff.added.map((n) => n.key)).toEqual(['testid=new']);
    expect(diff.removed.map((n) => n.key)).toEqual(['testid=gone']);
    expect(diff.changed).toHaveLength(0);
  });

  it('detects per-property style changes', () => {
    const a = snapshot([{ key: 'testid=x', styles: { color: 'red', 'font-size': '12px' } }]);
    const b = snapshot([{ key: 'testid=x', styles: { color: 'blue', 'font-size': '12px' } }]);
    const diff = diffSnapshots(a, b);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.styleChanges).toEqual([
      { prop: 'color', before: 'red', after: 'blue' },
    ]);
    expect(diff.summary.styleProps).toBe(1);
  });

  it('detects attribute added / removed / changed', () => {
    const a = snapshot([{ key: 'testid=x', attrs: { href: '/old', title: 'gone' } }]);
    const b = snapshot([{ key: 'testid=x', attrs: { href: '/new', role: 'link' } }]);
    const diff = diffSnapshots(a, b);
    const changes = diff.changed[0]?.attrChanges ?? [];
    // Отсортировано по имени: href (changed), role (added), title (removed).
    expect(changes).toEqual([
      { name: 'href', before: '/old', after: '/new' },
      { name: 'role', before: null, after: 'link' },
      { name: 'title', before: 'gone', after: null },
    ]);
    expect(diff.summary.attrProps).toBe(3);
  });

  it('detects own-text changes', () => {
    const a = snapshot([{ key: 'testid=x', text: 'before' }]);
    const b = snapshot([{ key: 'testid=x', text: 'after' }]);
    const diff = diffSnapshots(a, b);
    expect(diff.changed[0]?.textChange).toEqual({ before: 'before', after: 'after' });
    expect(diff.summary.textNodes).toBe(1);
  });

  it('uses the B-side selector for changed nodes (live page)', () => {
    const a = snapshot([{ key: 'testid=x', selector: 'div.old', text: '1' }]);
    const b = snapshot([{ key: 'testid=x', selector: 'div.new', text: '2' }]);
    const diff = diffSnapshots(a, b);
    expect(diff.changed[0]?.selector).toBe('div.new');
  });

  it('does NOT avalanche on reorder when identity is determinable (keyed nodes)', () => {
    // Те же три узла с data-testid, порядок в B перевёрнут — идентичность определима.
    const a = snapshot([
      { key: 'testid=1', text: 'one' },
      { key: 'testid=2', text: 'two' },
      { key: 'testid=3', text: 'three' },
    ]);
    const b = snapshot([
      { key: 'testid=3', text: 'three' },
      { key: 'testid=2', text: 'two' },
      { key: 'testid=1', text: 'one' },
    ]);
    const diff = diffSnapshots(a, b);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.summary).toMatchObject({ added: 0, removed: 0, changed: 0 });
  });

  it('isolates a single point change to exactly one node', () => {
    const specs = Array.from({ length: 20 }, (_, i) => ({
      key: `testid=n${String(i)}`,
      text: `t${String(i)}`,
    }));
    const a = snapshot(specs);
    const b = snapshot(specs.map((s) => (s.key === 'testid=n7' ? { ...s, text: 'CHANGED' } : s)));
    const diff = diffSnapshots(a, b);
    expect(diff.summary).toMatchObject({ added: 0, removed: 0, changed: 1 });
    expect(diff.changed[0]?.key).toBe('testid=n7');
  });

  it('shows path-keyed reorder as added/removed (identity not determinable)', () => {
    // Без testid/id пути меняются при reorder — это ожидаемое поведение fallback-ключа.
    const a = snapshot([
      { key: 'path=/0', text: 'a' },
      { key: 'path=/1', text: 'b' },
    ]);
    const b = snapshot([
      { key: 'path=/0', text: 'b' },
      { key: 'path=/1', text: 'a' },
    ]);
    const diff = diffSnapshots(a, b);
    // Оба узла «изменились» текстом (путь тот же, содержимое разное).
    expect(diff.summary.changed).toBe(2);
  });
});

describe('selectChanges', () => {
  const a = snapshot([
    { key: 'testid=s', styles: { color: 'red' }, text: 'keep', attrs: { role: 'x' } },
    { key: 'testid=t', text: 'old' },
    { key: 'testid=gone' },
  ]);
  const b = snapshot([
    { key: 'testid=s', styles: { color: 'blue' }, text: 'keep', attrs: { role: 'y' } },
    { key: 'testid=t', text: 'new' },
    { key: 'testid=added' },
  ]);
  const diff = diffSnapshots(a, b);

  it('all → everything', () => {
    const f = selectChanges(diff, 'all');
    expect(f.added).toHaveLength(1);
    expect(f.removed).toHaveLength(1);
    expect(f.changed.length).toBeGreaterThan(0);
  });

  it('structure → only added/removed', () => {
    const f = selectChanges(diff, 'structure');
    expect(f.added).toHaveLength(1);
    expect(f.removed).toHaveLength(1);
    expect(f.changed).toHaveLength(0);
  });

  it('styles → only nodes with style changes, stripped to styleChanges', () => {
    const f = selectChanges(diff, 'styles');
    expect(f.added).toHaveLength(0);
    expect(f.removed).toHaveLength(0);
    const changed = f.changed.find((c) => c.key === 'testid=s');
    expect(changed?.styleChanges).toHaveLength(1);
    expect(changed?.attrChanges).toHaveLength(0);
    expect(changed?.textChange).toBeNull();
    // Узел, менявший только текст, не попадает под фильтр стилей.
    expect(f.changed.some((c) => c.key === 'testid=t')).toBe(false);
  });

  it('text → only nodes with text changes, stripped to textChange', () => {
    const f = selectChanges(diff, 'text');
    const changed = f.changed.find((c) => c.key === 'testid=t');
    expect(changed?.textChange).toEqual({ before: 'old', after: 'new' });
    expect(changed?.styleChanges).toHaveLength(0);
    expect(changed?.attrChanges).toHaveLength(0);
  });
});

describe('reports', () => {
  const a = snapshot([
    {
      key: 'testid=x',
      tag: 'a',
      selector: 'a#x',
      attrs: { href: '/old' },
      styles: { color: 'red' },
      text: 'old',
    },
    { key: 'testid=rm', tag: 'b', selector: 'b.rm' },
  ]);
  const b = snapshot([
    {
      key: 'testid=x',
      tag: 'a',
      selector: 'a#x',
      attrs: { href: '/new' },
      styles: { color: 'blue' },
      text: 'new',
    },
    { key: 'testid=add', tag: 'i', selector: 'i.add' },
  ]);
  const diff = diffSnapshots(a, b);

  it('toJSONReport is valid JSON round-tripping the diff', () => {
    const parsed = JSON.parse(toJSONReport(diff)) as { summary: { added: number } };
    expect(parsed.summary.added).toBe(1);
  });

  it('toMarkdownReport renders summary and all sections', () => {
    const md = toMarkdownReport(diff);
    expect(md).toContain('# Snapshot diff');
    expect(md).toContain('## Added');
    expect(md).toContain('## Removed');
    expect(md).toContain('## Changed');
    expect(md).toContain('attr `href`');
    expect(md).toContain('style `color`');
    expect(md).toContain('text');
    expect(md).toContain('i.add');
  });

  it('markdown renders ∅ for empty/missing values and escapes pipes', () => {
    const a2 = snapshot([{ key: 'testid=y', selector: 'p|x', text: '' }]);
    const b2 = snapshot([{ key: 'testid=y', selector: 'p|x', text: 'now' }]);
    const md = toMarkdownReport(diffSnapshots(a2, b2));
    expect(md).toContain('∅');
    expect(md).toContain('p\\|x');
  });

  it('markdown omits empty sections', () => {
    const only = snapshot([{ key: 'testid=z', text: 'a' }]);
    const only2 = snapshot([{ key: 'testid=z', text: 'b' }]);
    const md = toMarkdownReport(diffSnapshots(only, only2));
    expect(md).not.toContain('## Added');
    expect(md).not.toContain('## Removed');
    expect(md).toContain('## Changed');
  });

  it('buildDiffReport dispatches by format', () => {
    expect(buildDiffReport(diff, 'json').startsWith('{')).toBe(true);
    expect(buildDiffReport(diff, 'markdown').startsWith('# Snapshot diff')).toBe(true);
  });
});

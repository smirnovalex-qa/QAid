import { afterEach, describe, expect, it } from 'vitest';
import { SNAPSHOT_INSPECTOR_ID, collectSnapshot } from '../collector';
import { parseSnapshot } from '../types';
import type { SnapshotNode } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Индексирует собранные узлы по селектору. */
function bySelector(nodes: readonly SnapshotNode[]): Map<string, SnapshotNode> {
  return new Map(nodes.map((n) => [n.selector, n]));
}

/** Фейковый источник стилей: возвращает заданную карту (остальное — ''). */
function fakeStyle(map: Record<string, string>): (el: Element) => CSSStyleDeclaration {
  return () =>
    ({
      display: 'block',
      getPropertyValue: (prop: string) => map[prop] ?? '',
    }) as unknown as CSSStyleDeclaration;
}

describe('collectSnapshot', () => {
  it('exposes a stable inspector id', () => {
    expect(SNAPSHOT_INSPECTOR_ID).toBe('snapshot');
  });

  it('captures tag, curated attrs, own text, selector and structural path', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<section id="hero"><h1 class="title" data-testid="head">Hello <b>world</b></h1></section>';
    document.body.appendChild(root);

    const snap = collectSnapshot(root, fakeStyle({ color: 'rgb(0, 0, 0)' }));
    const head = bySelector(snap.nodes).get('h1.title');
    expect(head).toBeDefined();
    expect(head?.tag).toBe('h1');
    expect(head?.attrs).toMatchObject({ class: 'title', 'data-testid': 'head' });
    // Собственный прямой текст — только «Hello», без текста вложенного <b>.
    expect(head?.text).toBe('Hello');
    expect(head?.styles.color).toBe('rgb(0, 0, 0)');
    // Путь: root=/, section=/0, h1=/0/0.
    expect(head?.path).toBe('/0/0');
    expect(snap.truncated).toBe(false);
    expect(snap.visited).toBe(snap.nodes.length);
  });

  it('derives the stable key: data-testid → id → structural path', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a data-testid="link">t</a><b id="ident">i</b><i class="plain">p</i>';
    document.body.appendChild(root);

    const keys = collectSnapshot(root).nodes.map((n) => n.key);
    expect(keys).toContain('testid=link');
    expect(keys).toContain('id=ident');
    // Узел без testid/id получает путь-ключ.
    expect(keys.some((k) => k.startsWith('path=/'))).toBe(true);
  });

  it('uniquifies colliding testid/id keys with a ~N suffix', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p data-testid="dup">1</p><p data-testid="dup">2</p>';
    document.body.appendChild(root);

    const keys = collectSnapshot(root)
      .nodes.filter((n) => n.tag === 'p')
      .map((n) => n.key);
    expect(keys).toEqual(['testid=dup', 'testid=dup~1']);
  });

  it('reads only curated attributes, dropping noisy ones', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<button id="b" class="c" style="color:red" onclick="x()" title="hi" disabled></button>';
    document.body.appendChild(root);

    const node = bySelector(collectSnapshot(root).nodes).get('button#b.c');
    expect(node?.attrs).toMatchObject({ id: 'b', class: 'c', title: 'hi', disabled: '' });
    expect(node?.attrs.style).toBeUndefined();
    expect(node?.attrs.onclick).toBeUndefined();
  });

  it('captures all curated computed style props via injected getStyle', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="x">t</p>';
    document.body.appendChild(root);
    const p = root.querySelector('.x');
    const getStyle = (el: Element): CSSStyleDeclaration =>
      ({
        display: 'block',
        getPropertyValue: (prop: string) =>
          el === p && prop === 'font-size' ? '14px' : el === p && prop === 'color' ? 'red' : 'auto',
      }) as unknown as CSSStyleDeclaration;

    const node = bySelector(collectSnapshot(root, getStyle).nodes).get('p.x');
    expect(node?.styles['font-size']).toBe('14px');
    expect(node?.styles.color).toBe('red');
    expect(node?.styles.display).toBe('auto');
  });

  it('collapses and bounds long own text', () => {
    const root = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'long';
    p.textContent = `  ${'x'.repeat(400)}  `;
    root.appendChild(p);
    document.body.appendChild(root);

    const node = bySelector(collectSnapshot(root).nodes).get('p.long');
    expect(node?.text.endsWith('…')).toBe(true);
    expect((node?.text ?? '').length).toBeLessThan(400);
  });

  it('excludes the inspector overlay subtree', () => {
    const root = document.createElement('div');
    const overlay = document.createElement('div');
    overlay.setAttribute('data-qatb-overlay', '');
    overlay.innerHTML = '<span>overlay</span>';
    root.appendChild(overlay);
    root.appendChild(document.createElement('p')).textContent = 'kept';
    document.body.appendChild(root);

    const tags = collectSnapshot(root).nodes.map((n) => n.tag);
    expect(tags).not.toContain('span');
    expect(tags).toContain('p');
  });

  it('skips display:none subtrees via injected getStyle', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="vis">v</p><p class="hid">h</p>';
    document.body.appendChild(root);
    const hidden = root.querySelector('.hid');
    const getStyle = (el: Element): CSSStyleDeclaration =>
      ({
        display: el === hidden ? 'none' : 'block',
        getPropertyValue: () => '',
      }) as unknown as CSSStyleDeclaration;

    const selectors = collectSnapshot(root, getStyle).nodes.map((n) => n.selector);
    expect(selectors).toContain('p.vis');
    expect(selectors).not.toContain('p.hid');
  });

  it('marks the root path as / and computes child-index paths', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a>0</a><a>1</a><a>2</a>';
    document.body.appendChild(root);
    const snap = collectSnapshot(root);
    const rootNode = snap.nodes.find((n) => n.tag === 'div');
    expect(rootNode?.path).toBe('/');
    const paths = snap.nodes.filter((n) => n.tag === 'a').map((n) => n.path);
    expect(paths).toEqual(['/0', '/1', '/2']);
  });

  it('parseSnapshot validates the serialized model and rejects garbage', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="p">t</p>';
    document.body.appendChild(root);
    const snap = collectSnapshot(root);

    // Round-trip через сериализацию (как при пересечении границы сред).
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed).not.toBeNull();
    expect(parsed?.nodes.length).toBe(snap.nodes.length);

    expect(parseSnapshot({ nodes: 'nope' })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { DEFECTS_INSPECTOR_ID, collectDefects } from '../collector';
import type { DefectNode } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Индексирует собранные узлы по селектору для удобных ассертов. */
function bySelector(nodes: readonly DefectNode[]): Map<string, DefectNode> {
  return new Map(nodes.map((n) => [n.selector, n]));
}

/** Форсит `naturalWidth` у `<img>` (в jsdom он всегда 0) — для теста битой загрузки. */
function setNaturalWidth(img: HTMLImageElement, width: number): void {
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
}

describe('collectDefects', () => {
  it('exposes a stable inspector id', () => {
    expect(DEFECTS_INSPECTOR_ID).toBe('defects');
  });

  it('captures tag, attrs, role, selector and traversal index', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a id="home" class="nav main" href="/" role="link">Home</a>';
    document.body.appendChild(root);

    const out = collectDefects(root);
    const node = bySelector(out.nodes).get('a#home.nav.main');
    expect(node).toBeDefined();
    expect(node?.tag).toBe('a');
    expect(node?.attrs).toMatchObject({ id: 'home', href: '/', role: 'link', class: 'nav main' });
    expect(node?.role).toBe('link');
    expect(node?.headingLevel).toBeNull();
    expect(node?.naturalWidthZero).toBeNull();
    expect(typeof node?.index).toBe('number');
    expect(out.truncated).toBe(false);
    expect(out.visited).toBeGreaterThanOrEqual(2);
  });

  it('reads heading levels for h1..h6 and null otherwise', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>A</h1><h3>B</h3><p>C</p>';
    document.body.appendChild(root);
    const out = collectDefects(root);
    const levels = Object.fromEntries(out.nodes.map((n) => [n.tag, n.headingLevel]));
    expect(levels.h1).toBe(1);
    expect(levels.h3).toBe(3);
    expect(levels.p).toBeNull();
  });

  it('normalizes role to lowercase and null when absent', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div role="BUTTON">x</div><div>y</div>';
    document.body.appendChild(root);
    const roles = collectDefects(root).nodes.filter((n) => n.tag === 'div' && n.selector === 'div');
    // Первый div (root) без role; вложенные два — с/без.
    const withRole = collectDefects(root).nodes.find((n) => n.role !== null);
    expect(withRole?.role).toBe('button');
    expect(roles.every((n) => n.role === null || n.role === 'button')).toBe(true);
  });

  describe('accessible name', () => {
    const nameOf = (html: string, selector: string): string | undefined => {
      const root = document.createElement('div');
      root.innerHTML = html;
      document.body.appendChild(root);
      return bySelector(collectDefects(root).nodes).get(selector)?.accessibleNameHint;
    };

    it('prefers aria-label', () => {
      expect(nameOf('<button class="a" aria-label="Close">x</button>', 'button.a')).toBe('Close');
    });
    it('resolves aria-labelledby to referenced text', () => {
      expect(
        nameOf(
          '<span id="lbl">Delete row</span><button class="b" aria-labelledby="lbl"></button>',
          'button.b',
        ),
      ).toBe('Delete row');
    });
    it('ignores aria-labelledby pointing at a missing id, falling through', () => {
      expect(nameOf('<button class="c" aria-labelledby="nope">Fallback</button>', 'button.c')).toBe(
        'Fallback',
      );
    });
    it('uses alt for images', () => {
      expect(nameOf('<img class="d" alt="Logo">', 'img.d')).toBe('Logo');
    });
    it('uses title when no better name exists', () => {
      expect(nameOf('<span class="e" title="Hint"></span>', 'span.e')).toBe('Hint');
    });
    it('uses value for input buttons', () => {
      expect(nameOf('<input class="f" type="submit" value="Send">', 'input.f')).toBe('Send');
    });
    it('uses subtree text for buttons', () => {
      expect(nameOf('<button class="g"><span>Save now</span></button>', 'button.g')).toBe(
        'Save now',
      );
    });
    it('uses own text for generic elements', () => {
      expect(nameOf('<p class="h">Paragraph</p>', 'p.h')).toBe('Paragraph');
    });
    it('is empty when nothing provides a name', () => {
      expect(nameOf('<button class="i"></button>', 'button.i')).toBe('');
    });
    it('clips very long names', () => {
      const long = 'x'.repeat(200);
      const name = nameOf(`<p class="j">${long}</p>`, 'p.j');
      expect(name?.endsWith('…')).toBe(true);
      expect((name ?? '').length).toBeLessThan(200);
    });
  });

  it('measures naturalWidth === 0 for broken images', () => {
    const root = document.createElement('div');
    const broken = document.createElement('img');
    broken.className = 'broken';
    broken.src = 'https://example.test/missing.png';
    setNaturalWidth(broken, 0);
    const ok = document.createElement('img');
    ok.className = 'ok';
    ok.src = 'https://example.test/there.png';
    setNaturalWidth(ok, 42);
    root.append(broken, ok);
    document.body.appendChild(root);

    const map = bySelector(collectDefects(root).nodes);
    expect(map.get('img.broken')?.naturalWidthZero).toBe(true);
    expect(map.get('img.ok')?.naturalWidthZero).toBe(false);
  });

  it('excludes the inspector overlay subtree', () => {
    const root = document.createElement('div');
    const overlay = document.createElement('div');
    overlay.setAttribute('data-qatb-overlay', '');
    overlay.innerHTML = '<button>overlay button</button>';
    root.appendChild(overlay);
    root.appendChild(document.createElement('p')).textContent = 'kept';
    document.body.appendChild(root);

    const tags = collectDefects(root).nodes.map((n) => n.tag);
    expect(tags).not.toContain('button');
    expect(tags).toContain('p');
  });

  it('skips display:none subtrees via injected getStyle', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p class="vis">visible</p><p class="hid">hidden</p>';
    document.body.appendChild(root);
    const hidden = root.querySelector('.hid');
    const getStyle = (el: Element): CSSStyleDeclaration =>
      ({ display: el === hidden ? 'none' : 'block' }) as unknown as CSSStyleDeclaration;

    const selectors = collectDefects(root, getStyle).nodes.map((n) => n.selector);
    expect(selectors).toContain('p.vis');
    expect(selectors).not.toContain('p.hid');
  });
});

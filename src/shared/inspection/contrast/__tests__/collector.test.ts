import { afterEach, describe, expect, it } from 'vitest';
import { collectContrast, CONTRAST_INSPECTOR_ID } from '@/shared/inspection/contrast/collector';

/** Минимальный набор стилей, влияющих на сборщик контраста. */
interface FakeStyle {
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  fontSize: string;
  fontWeight: string;
  display: string;
}

const DEFAULT_STYLE: FakeStyle = {
  color: 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  fontSize: '16px',
  fontWeight: '400',
  display: 'block',
};

const styleMap = new WeakMap<Element, Partial<FakeStyle>>();

/** Инъектируемый источник стилей: сливает дефолты с заданными для узла. */
function fakeGetStyle(el: Element): CSSStyleDeclaration {
  return { ...DEFAULT_STYLE, ...styleMap.get(el) } as unknown as CSSStyleDeclaration;
}

function setStyle(el: Element, style: Partial<FakeStyle>): void {
  styleMap.set(el, style);
}

/** Создаёт элемент с текстом внутри контейнера. */
function addEl(
  parent: Element,
  tag: string,
  attrs: { id?: string; class?: string; text?: string },
  style: Partial<FakeStyle> = {},
): HTMLElement {
  const el = document.createElement(tag);
  if (attrs.id !== undefined) el.id = attrs.id;
  if (attrs.class !== undefined) el.className = attrs.class;
  if (attrs.text !== undefined) el.appendChild(document.createTextNode(attrs.text));
  parent.appendChild(el);
  setStyle(el, style);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectContrast', () => {
  it('exposes a stable inspector id', () => {
    expect(CONTRAST_INSPECTOR_ID).toBe('contrast');
  });

  it('measures a black-on-white pair with a high ratio', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    addEl(
      root,
      'p',
      { id: 'lead', class: 'intro', text: 'Hello world' },
      { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' },
    );

    const out = collectContrast(root, fakeGetStyle);
    expect(out.samples).toHaveLength(1);
    const s = out.samples[0];
    expect(s?.selector).toBe('p#lead.intro');
    expect(s?.text).toBe('Hello world');
    expect(s?.ratio).toBeGreaterThan(20);
    expect(s?.large).toBe(false);
    expect(s?.approximate).toBe(false);
    expect(out.truncated).toBe(false);
    expect(out.visited).toBeGreaterThanOrEqual(2); // root + p
  });

  it('detects large text from computed px/weight', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    addEl(root, 'h1', { text: 'Big' }, { fontSize: '32px', backgroundColor: 'rgb(255,255,255)' });
    addEl(
      root,
      'strong',
      { text: 'Bold-ish' },
      { fontSize: '19px', fontWeight: '700', backgroundColor: 'rgb(255,255,255)' },
    );

    const out = collectContrast(root, fakeGetStyle);
    const byTag = Object.fromEntries(out.samples.map((s) => [s.selector, s.large]));
    expect(byTag.h1).toBe(true);
    expect(byTag.strong).toBe(true);
  });

  it('composites semi-transparent text over the effective background', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    // Полупрозрачный чёрный текст на белом фоне → серый; контраст ниже, чем у сплошного чёрного.
    addEl(
      root,
      'p',
      { text: 'faint' },
      { color: 'rgba(0, 0, 0, 0.5)', backgroundColor: 'rgb(255, 255, 255)' },
    );
    const out = collectContrast(root, fakeGetStyle);
    const s = out.samples[0];
    expect(s?.fg.a).toBe(1); // альфа скомпонована
    expect(s?.ratio).toBeLessThan(21);
    expect(s?.ratio).toBeGreaterThan(1);
  });

  it('flags gradient/image backgrounds as approximate', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    addEl(
      root,
      'p',
      { text: 'on gradient' },
      { color: 'rgb(0,0,0)', backgroundImage: 'linear-gradient(#fff, #000)' },
    );
    const out = collectContrast(root, fakeGetStyle);
    expect(out.samples[0]?.approximate).toBe(true);
  });

  it('skips overlay subtrees, textless and hidden nodes, and unparseable colors', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    // Оверлей инспектора — исключается целиком.
    const overlay = addEl(root, 'div', { text: 'overlay text' });
    overlay.setAttribute('data-qatb-overlay', '');

    // Узел без собственного текста (текст только у потомка).
    const wrapper = addEl(root, 'div', {});
    addEl(wrapper, 'span', { text: 'nested' }, { backgroundColor: 'rgb(255,255,255)' });

    // display:none — пропускается.
    addEl(root, 'p', { text: 'hidden' }, { display: 'none' });

    // Нечитаемый цвет текста — образец не создаётся.
    addEl(root, 'p', { text: 'bad color' }, { color: 'not-a-color' });

    const out = collectContrast(root, fakeGetStyle);
    const selectors = out.samples.map((s) => s.selector);
    expect(selectors).toEqual(['span']); // только валидный текстовый узел
  });

  it('respects the node budget indirectly (truncated stays false under budget)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    for (let i = 0; i < 5; i += 1) {
      addEl(root, 'p', { text: `line ${String(i)}` }, { backgroundColor: 'rgb(255,255,255)' });
    }
    const out = collectContrast(root, fakeGetStyle);
    expect(out.samples).toHaveLength(5);
    expect(out.budget).toBeGreaterThan(5);
    expect(out.truncated).toBe(false);
  });
});

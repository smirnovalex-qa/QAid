/**
 * Юнит-тесты примитивов инспекции DOM и цвета (TASK-013). Проверяют эталонные
 * векторы WCAG, разбор CSS-цветов во всех форматах, композицию alpha, вычисление
 * эффективного фона и бюджетный обход DOM. Среда — jsdom.
 */
import { describe, expect, it } from 'vitest';
import {
  blend,
  contrastRatio,
  effectiveBackground,
  isInspectableElement,
  parseColor,
  relativeLuminance,
  toRgba,
  walk,
  OVERLAY_HOST_ATTR,
  PANEL_HOST_ATTR,
  type Rgba,
} from '@/shared/inspection/dom';

describe('parseColor', () => {
  it('parses #rgb shorthand', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#0a0')).toEqual({ r: 0, g: 170, b: 0, a: 1 });
  });

  it('parses #rgba shorthand with alpha', () => {
    expect(parseColor('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0x88 / 255 });
  });

  it('parses #rrggbb', () => {
    expect(parseColor('#767676')).toEqual({ r: 118, g: 118, b: 118, a: 1 });
  });

  it('parses #rrggbbaa', () => {
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0x80 / 255 });
  });

  it('parses rgb() comma syntax', () => {
    expect(parseColor('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });

  it('parses rgba() comma syntax with decimal alpha', () => {
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('parses modern space/slash syntax with percentage alpha', () => {
    expect(parseColor('rgb(255 0 0 / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
  });

  it('parses percentage rgb channels', () => {
    expect(parseColor('rgb(100%, 0%, 50%)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
  });

  it('parses hsl()', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor('hsl(240, 100%, 50%)')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  });

  it('covers all HSL hue sextants', () => {
    expect(parseColor('hsl(60, 100%, 50%)')).toEqual({ r: 255, g: 255, b: 0, a: 1 }); // yellow
    expect(parseColor('hsl(180, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 255, a: 1 }); // cyan
    expect(parseColor('hsl(300, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 255, a: 1 }); // magenta
  });

  it('parses hsl() achromatic (zero saturation) as gray', () => {
    expect(parseColor('hsl(0, 0%, 50%)')).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('parses hsla() with alpha and deg hue and modern slash', () => {
    expect(parseColor('hsla(360, 100%, 50%, 0.25)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 });
    expect(parseColor('hsl(120deg 100% 50% / 40%)')).toEqual({ r: 0, g: 255, b: 0, a: 0.4 });
  });

  it('wraps negative and >360 hues', () => {
    expect(parseColor('hsl(-240, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColor('hsl(480, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it('parses named transparent as alpha 0', () => {
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('parses black and white keywords', () => {
    expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('tolerates surrounding whitespace and casing', () => {
    expect(parseColor('   #FFF   ')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('  RGB( 10 , 20 , 30 )  ')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });

  it('clamps alpha into 0..1', () => {
    expect(parseColor('rgba(0,0,0,2)')?.a).toBe(1);
    expect(parseColor('rgba(0,0,0,-1)')?.a).toBe(0);
  });

  it('returns null on invalid inputs', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor('   ')).toBeNull();
    expect(parseColor('not-a-color')).toBeNull();
    expect(parseColor('#12')).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor('#gggggg')).toBeNull();
    expect(parseColor('rgb(1, 2)')).toBeNull();
    expect(parseColor('rgb(1, 2, 3, 4, 5)')).toBeNull();
    expect(parseColor('rgb(a, b, c)')).toBeNull();
    expect(parseColor('hsl(120, 100, 50%)')).toBeNull(); // saturation must be percent
    expect(parseColor('hsl(abc, 100%, 50%)')).toBeNull();
    expect(parseColor('rgb(1 2 3')).toBeNull();
    expect(parseColor('rgb(1 2 3 / abc)')).toBeNull(); // невалидная альфа
    // @ts-expect-error проверяем защиту от не-строкового ввода
    expect(parseColor(null)).toBeNull();
  });
});

describe('toRgba', () => {
  it('serializes to rgba(r, g, b, a)', () => {
    expect(toRgba({ r: 1, g: 2, b: 3, a: 0.5 })).toBe('rgba(1, 2, 3, 0.5)');
    expect(toRgba({ r: 0, g: 0, b: 0, a: 1 })).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('relativeLuminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it('matches the sRGB formula for a mid gray', () => {
    // 118/255 → linear ≈ 0.1810
    expect(relativeLuminance({ r: 118, g: 118, b: 118 })).toBeCloseTo(0.181, 3);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white (WCAG reference)', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 2);
  });

  it('is symmetric regardless of order', () => {
    const a = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    const b = contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 });
    expect(a).toBeCloseTo(b, 10);
  });

  it('is 1 for equal colors', () => {
    expect(contrastRatio({ r: 90, g: 90, b: 90 }, { r: 90, g: 90, b: 90 })).toBeCloseTo(1, 10);
  });

  it('matches the known #767676-on-white value (~4.54)', () => {
    const fg = parseColor('#767676');
    const bg = parseColor('#ffffff');
    expect(fg).not.toBeNull();
    expect(bg).not.toBeNull();
    expect(contrastRatio(fg!, bg!)).toBeCloseTo(4.54, 2);
  });
});

describe('blend', () => {
  it('returns `over` when it is fully opaque', () => {
    const over: Rgba = { r: 10, g: 20, b: 30, a: 1 };
    const under: Rgba = { r: 200, g: 200, b: 200, a: 1 };
    expect(blend(over, under)).toEqual(over);
  });

  it('returns `under` when `over` is fully transparent', () => {
    const over: Rgba = { r: 10, g: 20, b: 30, a: 0 };
    const under: Rgba = { r: 200, g: 100, b: 50, a: 1 };
    expect(blend(over, under)).toEqual(under);
  });

  it('composites half-alpha over opaque correctly', () => {
    // 0.5*0 + 0.5*200 = 100 per channel; outA = 1.
    const result = blend({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 200, g: 200, b: 200, a: 1 });
    expect(result).toEqual({ r: 100, g: 100, b: 100, a: 1 });
  });

  it('computes resulting alpha for two translucent layers', () => {
    // outA = 0.5 + 0.5*(1-0.5) = 0.75
    const result = blend({ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 255, a: 0.5 });
    expect(result.a).toBeCloseTo(0.75, 10);
    // r = (255*0.5 + 0*0.5*0.5)/0.75 = 170
    expect(result.r).toBe(170);
    // b = (0*0.5 + 255*0.5*0.5)/0.75 = 85
    expect(result.b).toBe(85);
  });

  it('returns fully transparent when both layers are transparent', () => {
    expect(blend({ r: 1, g: 2, b: 3, a: 0 }, { r: 4, g: 5, b: 6, a: 0 })).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });
});

/** Строит стаб getStyle, отдающий background/display по карте на элемент. */
function styleStub(
  map: Map<Element, { backgroundColor?: string; display?: string }>,
): (el: Element) => CSSStyleDeclaration {
  return (el) => {
    const entry = map.get(el) ?? {};
    return {
      backgroundColor: entry.backgroundColor ?? 'rgba(0, 0, 0, 0)',
      display: entry.display ?? 'block',
    } as unknown as CSSStyleDeclaration;
  };
}

describe('effectiveBackground', () => {
  it('returns the ancestor color through a transparent child', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    const styles = new Map<Element, { backgroundColor?: string; display?: string }>([
      [child, { backgroundColor: 'transparent' }],
      [parent, { backgroundColor: 'rgb(10, 20, 30)' }],
    ]);
    expect(effectiveBackground(child, styleStub(styles))).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 1,
    });
  });

  it('composites a translucent child over an opaque parent', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    const styles = new Map<Element, { backgroundColor?: string; display?: string }>([
      [child, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }],
      [parent, { backgroundColor: 'rgb(200, 200, 200)' }],
    ]);
    expect(effectiveBackground(child, styleStub(styles))).toEqual({
      r: 100,
      g: 100,
      b: 100,
      a: 1,
    });
  });

  it('falls back to white when the whole chain is transparent', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    const styles = new Map<Element, { backgroundColor?: string; display?: string }>([
      [child, { backgroundColor: 'transparent' }],
      [parent, { backgroundColor: 'transparent' }],
    ]);
    expect(effectiveBackground(child, styleStub(styles))).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
  });

  it('treats unparseable background as transparent and keeps climbing', () => {
    const root = document.createElement('div');
    const child = document.createElement('span');
    root.appendChild(child);
    const styles = new Map<Element, { backgroundColor?: string; display?: string }>([
      [child, { backgroundColor: 'not-a-color' }],
      [root, { backgroundColor: 'rgb(1, 2, 3)' }],
    ]);
    expect(effectiveBackground(child, styleStub(styles))).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });
});

describe('walk', () => {
  /** Собирает дерево `depth` уровней, каждый узел имеет `breadth` детей. */
  function buildTree(root: Element, depth: number, breadth: number): void {
    if (depth <= 0) return;
    for (let i = 0; i < breadth; i += 1) {
      const child = document.createElement('div');
      root.appendChild(child);
      buildTree(child, depth - 1, breadth);
    }
  }

  it('visits the whole tree in pre-order when budget is generous', () => {
    const root = document.createElement('div');
    const a = document.createElement('a');
    const b = document.createElement('b');
    root.append(a, b);
    const result = walk(root, { budget: 100, skipHidden: false });
    expect(result).toEqual([root, a, b]);
  });

  it('includes the root when it passes filters', () => {
    const root = document.createElement('div');
    const result = walk(root, { budget: 10, skipHidden: false });
    expect(result).toEqual([root]);
  });

  it('never returns more than budget and stops early', () => {
    const root = document.createElement('div');
    buildTree(root, 4, 3); // много узлов
    const result = walk(root, { budget: 5, skipHidden: false });
    expect(result).toHaveLength(5);
  });

  it('returns empty for non-positive budget', () => {
    const root = document.createElement('div');
    buildTree(root, 2, 2);
    expect(walk(root, { budget: 0 })).toEqual([]);
    expect(walk(root, { budget: -3 })).toEqual([]);
  });

  it('skips display:none subtrees via getStyle', () => {
    const root = document.createElement('div');
    const visible = document.createElement('section');
    const hidden = document.createElement('aside');
    const hiddenChild = document.createElement('p');
    hidden.appendChild(hiddenChild);
    root.append(visible, hidden);
    const styles = new Map<Element, { backgroundColor?: string; display?: string }>([
      [hidden, { display: 'none' }],
    ]);
    const result = walk(root, { budget: 100, getStyle: styleStub(styles) });
    expect(result).toContain(root);
    expect(result).toContain(visible);
    expect(result).not.toContain(hidden);
    expect(result).not.toContain(hiddenChild);
  });

  it('honors the exclude predicate for whole subtrees', () => {
    const root = document.createElement('div');
    const keep = document.createElement('main');
    const overlayHost = document.createElement('div');
    overlayHost.id = 'inspector-host';
    const overlayChild = document.createElement('span');
    overlayHost.appendChild(overlayChild);
    root.append(keep, overlayHost);
    const result = walk(root, {
      budget: 100,
      skipHidden: false,
      exclude: (el) => el.id === 'inspector-host',
    });
    expect(result).toContain(keep);
    expect(result).not.toContain(overlayHost);
    expect(result).not.toContain(overlayChild);
  });

  it('excludes the root itself when the root is hidden', () => {
    const root = document.createElement('div');
    root.appendChild(document.createElement('span'));
    const styles = new Map<Element, { backgroundColor?: string; display?: string }>([
      [root, { display: 'none' }],
    ]);
    expect(walk(root, { budget: 10, getStyle: styleStub(styles) })).toEqual([]);
  });

  // TASK-062: обход игнорирует и оверлей инспектора, и откреплённую плавающую панель —
  // инспектор не должен «видеть» собственные UI-хосты расширения как элементы страницы.
  it('skips the inspector overlay and the floating panel hosts (and their subtrees)', () => {
    const root = document.createElement('div');
    const keep = document.createElement('main');
    const overlay = document.createElement('div');
    overlay.setAttribute(OVERLAY_HOST_ATTR, '');
    overlay.appendChild(document.createElement('span'));
    const panel = document.createElement('div');
    panel.setAttribute(PANEL_HOST_ATTR, '');
    panel.appendChild(document.createElement('iframe'));
    root.append(keep, overlay, panel);

    const result = walk(root, { budget: 100, skipHidden: false });
    expect(result).toContain(keep);
    expect(result).not.toContain(overlay);
    expect(result).not.toContain(panel);
    expect(result.some((el) => el.tagName.toLowerCase() === 'iframe')).toBe(false);
  });
});

describe('isInspectableElement (own UI-host exclusion, TASK-062)', () => {
  it('rejects the floating panel host and its descendants', () => {
    const panel = document.createElement('div');
    panel.setAttribute(PANEL_HOST_ATTR, '');
    const inner = document.createElement('button');
    panel.appendChild(inner);
    document.body.appendChild(panel);
    try {
      expect(isInspectableElement(panel, { skipHidden: false })).toBe(false);
      expect(isInspectableElement(inner, { skipHidden: false })).toBe(false);
    } finally {
      panel.remove();
    }
  });

  it('still accepts an ordinary page element', () => {
    const el = document.createElement('section');
    document.body.appendChild(el);
    try {
      expect(isInspectableElement(el, { skipHidden: false })).toBe(true);
    } finally {
      el.remove();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { collectBoxModel, RULER_INSPECTOR_ID } from '@/shared/inspection/ruler/collector';

/** Плоская карта kebab-свойств → значение, за которой стоит фейковый computed style. */
type Props = Record<string, string>;

function fakeStyle(props: Props): CSSStyleDeclaration {
  return {
    getPropertyValue: (name: string): string => props[name] ?? '',
  } as unknown as CSSStyleDeclaration;
}

/** Фейковый элемент: только `getBoundingClientRect` (сборщику больше ничего не нужно). */
function fakeEl(rect: { x: number; y: number; width: number; height: number }): Element {
  return {
    getBoundingClientRect: () => rect as DOMRect,
  } as unknown as Element;
}

describe('collectBoxModel', () => {
  it('exposes a stable inspector id', () => {
    expect(RULER_INSPECTOR_ID).toBe('ruler');
  });

  it('reads padding/border/margin sides and derives the content box', () => {
    const el = fakeEl({ x: 10, y: 20, width: 200, height: 100 });
    const style = fakeStyle({
      'padding-top': '5px',
      'padding-right': '10px',
      'padding-bottom': '5px',
      'padding-left': '10px',
      'border-top-width': '1px',
      'border-right-width': '2px',
      'border-bottom-width': '1px',
      'border-left-width': '2px',
      'margin-top': '8px',
      'margin-right': '8px',
      'margin-bottom': '8px',
      'margin-left': '8px',
    });

    const box = collectBoxModel(el, () => style);
    expect(box.rect).toEqual({ x: 10, y: 20, width: 200, height: 100 });
    expect(box.padding).toEqual({ top: 5, right: 10, bottom: 5, left: 10 });
    expect(box.border).toEqual({ top: 1, right: 2, bottom: 1, left: 2 });
    expect(box.margin).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
    // content = rect − padding(l+r) − border(l+r) = 200 − 20 − 4 = 176; height = 100 − 10 − 2 = 88
    expect(box.content).toEqual({ width: 176, height: 88 });
  });

  it('treats auto/empty/NaN values as zero', () => {
    const el = fakeEl({ x: 0, y: 0, width: 50, height: 50 });
    const style = fakeStyle({
      'padding-top': 'auto',
      'margin-left': '',
      'border-top-width': 'thin',
    });
    const box = collectBoxModel(el, () => style);
    expect(box.padding.top).toBe(0);
    expect(box.margin.left).toBe(0);
    expect(box.border.top).toBe(0);
    expect(box.content).toEqual({ width: 50, height: 50 });
  });

  it('never returns a negative content size', () => {
    const el = fakeEl({ x: 0, y: 0, width: 10, height: 10 });
    const style = fakeStyle({
      'padding-left': '20px',
      'padding-right': '20px',
      'padding-top': '20px',
      'padding-bottom': '20px',
    });
    const box = collectBoxModel(el, () => style);
    expect(box.content).toEqual({ width: 0, height: 0 });
  });
});

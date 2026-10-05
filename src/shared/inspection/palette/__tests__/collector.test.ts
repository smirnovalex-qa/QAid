import { describe, expect, it } from 'vitest';
import { collectPalette, PALETTE_INSPECTOR_ID } from '../collector';

/** Карта «элемент → CSS-свойства» для инъектируемого getStyle. */
type StyleMap = Map<Element, Record<string, string>>;

/** Строит фейковый `getStyle`, отдающий display + getPropertyValue из карты. */
function fakeGetStyle(map: StyleMap): (el: Element) => CSSStyleDeclaration {
  return (el: Element) => {
    const props = map.get(el) ?? {};
    return {
      display: props.display ?? 'block',
      getPropertyValue: (name: string): string => props[name] ?? '',
    } as unknown as CSSStyleDeclaration;
  };
}

describe('collectPalette', () => {
  it('собирает цвета из простых и строковых свойств, дедуплицирует', () => {
    const root = document.createElement('div');
    const button = document.createElement('button');
    button.className = 'primary big';
    const link = document.createElement('a');
    root.append(button, link);

    const map: StyleMap = new Map<Element, Record<string, string>>([
      [root, { 'background-color': 'rgb(255, 255, 255)' }],
      [
        button,
        {
          'background-color': 'rgb(255, 0, 0)',
          color: 'rgb(255, 255, 255)',
          'box-shadow': 'rgba(0, 0, 0, 0.2) 0px 1px 3px 0px',
        },
      ],
      [link, { color: 'rgb(255, 0, 0)' }],
    ]);

    const data = collectPalette(root, fakeGetStyle(map));
    expect(data.elements).toBe(3);

    const red = data.entries.find((e) => e.hex === '#ff0000');
    expect(red?.count).toBe(2); // button bg + link color
    // Селектор кнопки усечён до двух классов.
    expect(red?.usages.some((u) => u.selector === 'button.primary.big')).toBe(true);

    expect(data.entries.some((e) => e.hex === '#ffffff')).toBe(true);
    // Цвет из box-shadow извлечён (полупрозрачный чёрный → HEX8).
    expect(data.entries.some((e) => e.hex === '#00000033')).toBe(true);
  });

  it('исключает оверлей и скрытые узлы, отбрасывает прозрачное', () => {
    const root = document.createElement('div');
    const overlay = document.createElement('div');
    overlay.setAttribute('data-qatb-overlay', '');
    const hidden = document.createElement('span');
    const visible = document.createElement('p');
    root.append(overlay, hidden, visible);

    const map: StyleMap = new Map<Element, Record<string, string>>([
      [root, { color: 'rgba(0, 0, 0, 0)' }], // прозрачный — отбрасывается
      [overlay, { 'background-color': 'rgb(1, 2, 3)' }],
      [hidden, { display: 'none', color: 'rgb(4, 5, 6)' }],
      [visible, { color: 'rgb(0, 128, 0)' }],
    ]);

    const data = collectPalette(root, fakeGetStyle(map));
    // root(visible=color transparent), visible; overlay+hidden исключены обходом.
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]?.hex).toBe('#008000');
  });

  it('не бросает на сложных/битых строковых значениях', () => {
    const root = document.createElement('div');
    const map: StyleMap = new Map<Element, Record<string, string>>([
      [
        root,
        {
          'box-shadow': 'inset 0 0 0 1px rgb(10 20 30 / 40%), 0 2px 4px hsl(200, 50%, 50%)',
          'background-image': 'linear-gradient(90deg, #ff0000, rgba(0,255,0,0.5) 50%, garbage)',
        },
      ],
    ]);

    expect(() => collectPalette(root, fakeGetStyle(map))).not.toThrow();
    const data = collectPalette(root, fakeGetStyle(map));
    // Извлечены распознанные токены (rgb-modern, hsl, hex, rgba); мусор проигнорирован.
    expect(data.entries.length).toBeGreaterThanOrEqual(3);
  });

  it('экспортирует стабильный идентификатор инспектора', () => {
    expect(PALETTE_INSPECTOR_ID).toBe('palette');
  });
});

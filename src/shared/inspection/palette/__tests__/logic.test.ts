import { describe, expect, it } from 'vitest';
import { parseColor as domParseColor } from '@/shared/inspection/dom';
import type { Rgba } from '@/shared/inspection/dom';
import {
  aggregatePalette,
  formatValue,
  paletteExport,
  paletteToJson,
  parseColor,
  readableLabelColor,
  rgbToHsl,
  sortPalette,
  toHex,
  toHslString,
  toRgbString,
} from '../logic';
import type { PaletteEntry, PaletteHit } from '../types';
import { BLACK, BLUE, GRAY, GREEN, HITS, RED, SEMI_RED, WHITE } from './fixtures/colors';

/** Строит запись палитры из одного цвета (частота/использования не важны). */
function entryOf(rgba: Rgba): PaletteEntry {
  const [entry] = aggregatePalette([{ rgba, selector: 's', property: 'color' }]);
  if (entry === undefined) throw new Error('no entry');
  return entry;
}

describe('toHex', () => {
  it('6-значный HEX при alpha=1 с паддингом каналов', () => {
    expect(toHex(RED)).toBe('#ff0000');
    expect(toHex({ r: 0, g: 8, b: 16, a: 1 })).toBe('#000810');
  });

  it('HEX8 при alpha<1 (альфа масштабируется в 0..255)', () => {
    expect(toHex(SEMI_RED)).toBe('#ff000080');
    expect(toHex({ r: 0, g: 0, b: 0, a: 0 })).toBe('#00000000');
  });
});

describe('toRgbString', () => {
  it('rgb() при alpha=1', () => {
    expect(toRgbString(GREEN)).toBe('rgb(0, 128, 0)');
  });

  it('rgba() с компактной альфой при alpha<1', () => {
    expect(toRgbString(SEMI_RED)).toBe('rgba(255, 0, 0, 0.5)');
    expect(toRgbString({ r: 1, g: 2, b: 3, a: 0.3333 })).toBe('rgba(1, 2, 3, 0.333)');
  });
});

describe('rgbToHsl', () => {
  it('серый — насыщенность и оттенок 0', () => {
    const hsl = rgbToHsl(GRAY);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(0.502, 2);
  });

  it('красный/зелёный/синий — покрывают все ветки max', () => {
    expect(rgbToHsl(RED).h).toBeCloseTo(0, 1);
    expect(rgbToHsl(GREEN).h).toBeCloseTo(120, 0);
    expect(rgbToHsl(BLUE).h).toBeCloseTo(240, 0);
  });

  it('оттенок между красным и синим (ветка h<0 нормализуется)', () => {
    // Пурпурный: max=r, g<b → (g-b)/delta отрицателен → h+360.
    expect(rgbToHsl({ r: 255, g: 0, b: 128 }).h).toBeCloseTo(330, 0);
  });
});

describe('toHslString', () => {
  it('hsl() при alpha=1, hsla() при alpha<1', () => {
    expect(toHslString(RED)).toBe('hsl(0, 100%, 50%)');
    expect(toHslString(SEMI_RED)).toBe('hsla(0, 100%, 50%, 0.5)');
  });

  it('RGB→HSL→RGB round-trip в допуске, альфа сохраняется', () => {
    for (const c of [RED, GREEN, BLUE, GRAY, { r: 33, g: 150, b: 243, a: 0.7 }]) {
      const back = domParseColor(toHslString(c));
      expect(back).not.toBeNull();
      if (back === null) continue;
      expect(back.r).toBeCloseTo(c.r, -1);
      expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(2);
      expect(back.a).toBeCloseTo(c.a, 2);
    }
  });
});

describe('readableLabelColor', () => {
  it('чёрный текст на светлом, белый — на тёмном', () => {
    expect(readableLabelColor(WHITE)).toBe('#000');
    expect(readableLabelColor(BLACK)).toBe('#fff');
    expect(readableLabelColor(BLUE)).toBe('#fff');
  });
});

describe('formatValue', () => {
  it('возвращает значение выбранного формата', () => {
    const entry = entryOf(SEMI_RED);
    expect(formatValue(entry, 'hex')).toBe('#ff000080');
    expect(formatValue(entry, 'rgb')).toBe('rgba(255, 0, 0, 0.5)');
    expect(formatValue(entry, 'hsl')).toBe('hsla(0, 100%, 50%, 0.5)');
  });
});

describe('aggregatePalette', () => {
  it('дедуплицирует по каноничному значению, считает частоту и использования', () => {
    const entries = aggregatePalette(HITS);
    const red = entries.find((e) => e.hex === '#ff0000');
    const blue = entries.find((e) => e.hex === '#0000ff');
    expect(red?.count).toBe(3);
    expect(blue?.count).toBe(1);
    // Два места использования красного, отсортированы по частоте.
    expect(red?.usages).toEqual([
      { selector: 'button.primary', property: 'background-color', count: 2 },
      { selector: 'a', property: 'color', count: 1 },
    ]);
    expect(red?.usagesOverflow).toBe(0);
  });

  it('альфа различает записи (точное совпадение включая alpha)', () => {
    const entries = aggregatePalette([
      { rgba: RED, selector: 's', property: 'color' },
      { rgba: SEMI_RED, selector: 's', property: 'color' },
    ]);
    expect(entries).toHaveLength(2);
  });

  it('усекает использования до maxUsages со счётчиком переполнения', () => {
    const hits: PaletteHit[] = [
      { rgba: RED, selector: 'a', property: 'color' },
      { rgba: RED, selector: 'b', property: 'color' },
      { rgba: RED, selector: 'c', property: 'color' },
    ];
    const [entry] = aggregatePalette(hits, 1);
    expect(entry?.usages).toHaveLength(1);
    expect(entry?.usagesOverflow).toBe(2);
  });

  it('тай-брейк использований по селектору при равной частоте', () => {
    const [entry] = aggregatePalette([
      { rgba: RED, selector: 'zeta', property: 'color' },
      { rgba: RED, selector: 'alpha', property: 'color' },
    ]);
    expect(entry?.usages.map((u) => u.selector)).toEqual(['alpha', 'zeta']);
  });
});

describe('sortPalette', () => {
  const entries = aggregatePalette([
    { rgba: BLUE, selector: 's', property: 'color' },
    { rgba: GREEN, selector: 's', property: 'color' },
    { rgba: GREEN, selector: 's', property: 'color' },
    { rgba: WHITE, selector: 's', property: 'color' },
  ]);

  it('по частоте (убыв.)', () => {
    expect(sortPalette(entries, 'frequency')[0]?.hex).toBe('#008000');
  });

  it('по оттенку (серые/белые с h=0 первыми)', () => {
    const byHue = sortPalette(entries, 'hue');
    expect(byHue[0]?.hex).toBe('#ffffff'); // h=0 (серый/белый)
    expect(byHue.at(-1)?.hex).toBe('#0000ff'); // h=240
  });

  it('по светлоте (тёмные → светлые)', () => {
    const byLight = sortPalette(entries, 'lightness');
    expect(byLight[0]?.hex).toBe('#0000ff');
    expect(byLight.at(-1)?.hex).toBe('#ffffff');
  });

  it('тай-брейк по HEX при равном ключе сортировки', () => {
    const same = aggregatePalette([
      { rgba: { r: 0, g: 0, b: 255, a: 1 }, selector: 's', property: 'color' },
      { rgba: { r: 0, g: 0, b: 254, a: 1 }, selector: 's', property: 'color' },
    ]);
    // Одинаковая частота (1) → тай-брейк по HEX (#0000fe < #0000ff).
    expect(sortPalette(same, 'frequency')[0]?.hex).toBe('#0000fe');
  });

  it('тай-брейк по HEX при равной светлоте/оттенке (альфа не влияет)', () => {
    // Один цвет с разной альфой: оттенок и WCAG-яркость совпадают (альфа
    // игнорируется) → сортировки падают в тай-брейк по HEX.
    const pair = aggregatePalette([
      { rgba: SEMI_RED, selector: 's', property: 'color' },
      { rgba: RED, selector: 's', property: 'color' },
    ]);
    expect(sortPalette(pair, 'hue')[0]?.hex).toBe('#ff0000');
    expect(sortPalette(pair, 'lightness')[0]?.hex).toBe('#ff0000');
  });

  it('не мутирует исходный массив', () => {
    const before = entries.map((e) => e.hex);
    sortPalette(entries, 'hue');
    expect(entries.map((e) => e.hex)).toEqual(before);
  });
});

describe('export', () => {
  const entries = aggregatePalette(HITS);

  it('JSON — массив { hex, rgb, hsl, count, usages }', () => {
    const json = JSON.parse(paletteToJson(entries)) as unknown[];
    expect(json).toHaveLength(2);
    expect(json[0]).toHaveProperty('hex');
    expect(json[0]).toHaveProperty('rgb');
    expect(json[0]).toHaveProperty('hsl');
    expect(json[0]).toHaveProperty('count');
    expect(json[0]).toHaveProperty('usages');
  });

  it('paletteExport: plain/json/csv', () => {
    expect(paletteExport(entries, 'plain', 'hex')).toContain('#ff0000');
    expect(paletteExport(entries, 'csv', 'rgb')).toContain('color');
    expect(JSON.parse(paletteExport(entries, 'json', 'hex'))).toHaveLength(2);
  });
});

describe('parseColor reexport', () => {
  it('реэкспортирует парсер слоя без собственной реализации', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor === domParseColor).toBe(true);
  });
});

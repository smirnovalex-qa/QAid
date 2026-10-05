import { describe, it, expect } from 'vitest';
import {
  CYRILLIC_LOWER,
  CYRILLIC_UPPER,
  DIGITS,
  EMOJI,
  LATIN_LOWER,
  LATIN_UPPER,
  SPECIAL,
} from '../charsets';

const ALL_SETS: Record<string, readonly string[]> = {
  LATIN_LOWER,
  LATIN_UPPER,
  CYRILLIC_LOWER,
  CYRILLIC_UPPER,
  DIGITS,
  SPECIAL,
  EMOJI,
};

/** Число графем в строке (через Intl.Segmenter при доступности). */
function graphemeCount(s: string): number {
  if ('Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)).length;
  }
  return Array.from(s).length;
}

describe('charsets — ожидаемые размеры', () => {
  it('LATIN_LOWER = 26, LATIN_UPPER = 26', () => {
    expect(LATIN_LOWER).toHaveLength(26);
    expect(LATIN_UPPER).toHaveLength(26);
  });

  it('CYRILLIC_LOWER = 33, CYRILLIC_UPPER = 33 (включая ё/Ё)', () => {
    expect(CYRILLIC_LOWER).toHaveLength(33);
    expect(CYRILLIC_UPPER).toHaveLength(33);
    expect(CYRILLIC_LOWER).toContain('ё');
    expect(CYRILLIC_UPPER).toContain('Ё');
  });

  it('DIGITS = 10', () => {
    expect(DIGITS).toStrictEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('SPECIAL непустой', () => {
    expect(SPECIAL.length).toBeGreaterThan(0);
  });

  it('EMOJI непустой', () => {
    expect(EMOJI.length).toBeGreaterThan(0);
  });

  it('первые/последние буквенные границы корректны', () => {
    expect(LATIN_LOWER[0]).toBe('a');
    expect(LATIN_LOWER[25]).toBe('z');
    expect(LATIN_UPPER[0]).toBe('A');
    expect(LATIN_UPPER[25]).toBe('Z');
    expect(CYRILLIC_LOWER[0]).toBe('а');
    expect(CYRILLIC_UPPER[0]).toBe('А');
  });
});

describe('charsets — валидность графем', () => {
  it('каждый элемент каждого набора — одиночная графема без разрыва суррогатов', () => {
    for (const chars of Object.values(ALL_SETS)) {
      for (const ch of chars) {
        expect(ch.length).toBeGreaterThan(0);
        expect(graphemeCount(ch)).toBe(1);
        // Нет «висячих» суррогатов: перекодировка через кодовые точки обратима.
        expect(String.fromCodePoint(...Array.from(ch, (c) => c.codePointAt(0) ?? 0))).toBe(ch);
      }
    }
  });

  it('внутри каждого набора нет дубликатов', () => {
    for (const [name, chars] of Object.entries(ALL_SETS)) {
      expect(new Set(chars).size, name).toBe(chars.length);
    }
  });

  it('EMOJI — по одной кодовой паре, без ZWJ-склеек', () => {
    for (const e of EMOJI) {
      expect(e.includes('‍')).toBe(false); // нет ZWJ
      expect(Array.from(e).length).toBeLessThanOrEqual(2); // одиночная кодовая точка или суррогатная пара
    }
  });
});

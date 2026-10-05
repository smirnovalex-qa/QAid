import { describe, expect, it } from 'vitest';
import {
  aggregateUsages,
  canonicalFamily,
  classifySource,
  formatReport,
  normalizeFamily,
  sortUsages,
  stripQuotes,
} from '../logic';
import { makeSample, SAMPLE_SET } from './fixtures/fonts';

describe('stripQuotes', () => {
  it('снимает парные двойные и одинарные кавычки', () => {
    expect(stripQuotes('"Helvetica Neue"')).toBe('Helvetica Neue');
    expect(stripQuotes("'Times New Roman'")).toBe('Times New Roman');
  });

  it('не трогает строку без обрамляющих кавычек или с непарными', () => {
    expect(stripQuotes('Arial')).toBe('Arial');
    expect(stripQuotes('"Arial')).toBe('"Arial');
    expect(stripQuotes('a')).toBe('a');
    expect(stripQuotes('')).toBe('');
  });
});

describe('normalizeFamily', () => {
  it('разбирает список в цепочку fallback и снимает кавычки', () => {
    expect(normalizeFamily('"Helvetica Neue", Arial, sans-serif')).toEqual([
      'Helvetica Neue',
      'Arial',
      'sans-serif',
    ]);
  });

  it('отбрасывает пустые токены и обрабатывает одиночное семейство', () => {
    expect(normalizeFamily('Inter, , ,')).toEqual(['Inter']);
    expect(normalizeFamily('Inter')).toEqual(['Inter']);
    expect(normalizeFamily('')).toEqual([]);
  });

  it('нестроковый вход даёт пустой массив', () => {
    expect(normalizeFamily(undefined as unknown as string)).toEqual([]);
  });
});

describe('canonicalFamily', () => {
  it('снимает кавычки и приводит к нижнему регистру', () => {
    expect(canonicalFamily('"Inter"')).toBe('inter');
    expect(canonicalFamily('Roboto')).toBe('roboto');
  });
});

describe('classifySource', () => {
  const loaded = new Set(['inter', 'roboto']);

  it('веб-шрифт — при совпадении с загруженным семейством', () => {
    expect(classifySource('Inter', loaded)).toBe('web');
    expect(classifySource('"Roboto"', loaded)).toBe('web');
  });

  it('локальный — при отсутствии в загруженных', () => {
    expect(classifySource('Arial', loaded)).toBe('local');
  });

  it('неизвестный — при пустом имени', () => {
    expect(classifySource('', loaded)).toBe('unknown');
    expect(classifySource('  ', loaded)).toBe('unknown');
  });
});

describe('aggregateUsages', () => {
  const loaded = new Set(['inter']);

  it('агрегирует по семейству: частота, размеры/веса/стили, места', () => {
    const usages = aggregateUsages(SAMPLE_SET, loaded, true);
    const inter = usages.find((u) => u.family === 'Inter');
    expect(inter).toBeDefined();
    expect(inter?.count).toBe(3);
    expect(inter?.source).toBe('web');
    // Размеры дедуплицированы и отсортированы численно (14 < 16 < 32).
    expect(inter?.sizes).toEqual(['14px', '16px', '32px']);
    expect(inter?.weights).toEqual(['400', '700']);
    expect(inter?.usages).toHaveLength(3);

    const mono = usages.find((u) => u.family === 'monospace');
    expect(mono?.source).toBe('local');
    expect(mono?.styles).toEqual(['italic']);
  });

  it('при недоступном document.fonts все источники — unknown', () => {
    const usages = aggregateUsages(SAMPLE_SET, loaded, false);
    expect(usages.every((u) => u.source === 'unknown')).toBe(true);
  });

  it('пустой ввод даёт пустой список', () => {
    expect(aggregateUsages([], loaded, true)).toEqual([]);
  });

  it('сэмпл с пустым семейством попадает в ключ по канону и источник unknown', () => {
    const usages = aggregateUsages(
      [makeSample({ family: '', fontSize: '', fontWeight: '' })],
      new Set(),
      true,
    );
    expect(usages).toHaveLength(1);
    expect(usages[0]?.source).toBe('unknown');
    expect(usages[0]?.sizes).toEqual([]);
  });
});

describe('sortUsages', () => {
  const usages = aggregateUsages(SAMPLE_SET, new Set(['inter']), true);

  it('по частоте — убывание (Inter ×3 перед monospace ×1)', () => {
    const sorted = sortUsages(usages, 'count');
    expect(sorted[0]?.family).toBe('Inter');
  });

  it('по имени — возрастание', () => {
    const sorted = sortUsages(usages, 'name');
    expect(sorted.map((u) => u.family)).toEqual(['Inter', 'monospace']);
  });

  it('не мутирует исходный массив', () => {
    const copy = [...usages];
    sortUsages(usages, 'name');
    expect(usages).toEqual(copy);
  });
});

describe('formatReport', () => {
  const usages = aggregateUsages(SAMPLE_SET, new Set(['inter']), true);

  it('plain — по строке на семейство', () => {
    const out = formatReport(usages, 'plain');
    expect(out).toContain('Inter [web] x3');
    expect(out.split('\n')).toHaveLength(2);
  });

  it('json — валидный разбираемый массив объектов', () => {
    const parsed = JSON.parse(formatReport(usages, 'json')) as { family: string }[];
    expect(parsed.map((r) => r.family)).toContain('Inter');
  });

  it('csv — заголовок и строки RFC 4180 (CRLF)', () => {
    const out = formatReport(usages, 'csv');
    const [header, ...rows] = out.split('\r\n');
    expect(header).toBe('family,source,count,sizes,weights,styles');
    expect(rows).toHaveLength(2);
  });
});

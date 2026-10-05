import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/shared/inspection/dom';
import type { Rgba } from '@/shared/inspection/dom';
import {
  buildReport,
  classify,
  filterSamples,
  isLargeText,
  matchesTextType,
  roundRatio,
  summarize,
  threshold,
  toReportRows,
} from '@/shared/inspection/contrast/logic';
import type { ContrastSample } from '@/shared/inspection/contrast/types';
import { CLASSIFY_VECTORS, LARGE_VECTORS, WEBAIM_RATIOS } from './fixtures/pairs';

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** Фабрика образца с разумными дефолтами (переопределяем только нужное). */
function sample(over: Partial<ContrastSample> = {}): ContrastSample {
  return {
    selector: 'p',
    text: 'text',
    fg: BLACK,
    bg: WHITE,
    ratio: 21,
    large: false,
    approximate: false,
    ...over,
  };
}

describe('threshold', () => {
  it('returns WCAG thresholds per level and text size', () => {
    expect(threshold('AA', false)).toBe(4.5);
    expect(threshold('AA', true)).toBe(3.0);
    expect(threshold('AAA', false)).toBe(7.0);
    expect(threshold('AAA', true)).toBe(4.5);
  });
});

describe('isLargeText', () => {
  it.each(LARGE_VECTORS)('px=$px weight=$weight → large=$large', ({ px, weight, large }) => {
    expect(isLargeText(px, weight)).toBe(large);
  });
});

describe('classify', () => {
  it.each(CLASSIFY_VECTORS)('$name', ({ ratio, large, aa, aaa }) => {
    expect(classify(sample({ ratio, large }), 'AA')).toBe(aa);
    expect(classify(sample({ ratio, large }), 'AAA')).toBe(aaa);
  });
});

describe('matchesTextType', () => {
  it('matches all, large and normal filters', () => {
    const large = sample({ large: true });
    const normal = sample({ large: false });
    expect(matchesTextType(large, 'all')).toBe(true);
    expect(matchesTextType(normal, 'all')).toBe(true);
    expect(matchesTextType(large, 'large')).toBe(true);
    expect(matchesTextType(normal, 'large')).toBe(false);
    expect(matchesTextType(large, 'normal')).toBe(false);
    expect(matchesTextType(normal, 'normal')).toBe(true);
  });
});

describe('filterSamples', () => {
  const pass = sample({ selector: 'a', ratio: 21, large: false }); // AA pass
  const fail = sample({ selector: 'b', ratio: 2, large: false }); // AA fail
  const largePass = sample({ selector: 'c', ratio: 3.5, large: true }); // AA large pass
  const all = [pass, fail, largePass];

  it('keeps everything with permissive filter', () => {
    expect(filterSamples(all, { level: 'AA', textType: 'all', onlyFails: false })).toHaveLength(3);
  });

  it('drops passes when onlyFails is set', () => {
    const out = filterSamples(all, { level: 'AA', textType: 'all', onlyFails: true });
    expect(out).toEqual([fail]);
  });

  it('filters by text type without rescan', () => {
    const out = filterSamples(all, { level: 'AA', textType: 'large', onlyFails: false });
    expect(out).toEqual([largePass]);
  });

  it('combines onlyFails with text type', () => {
    const out = filterSamples(all, { level: 'AAA', textType: 'normal', onlyFails: true });
    // Под AAA normal порог 7.0: pass(21) проходит, fail(2) — нет; largePass отфильтрован по типу.
    expect(out).toEqual([fail]);
  });
});

describe('summarize', () => {
  it('counts pass/fail across all samples at a level (ignoring UI filters)', () => {
    const samples = [
      sample({ ratio: 21 }), // pass at AA and AAA
      sample({ ratio: 5 }), // pass AA, fail AAA
      sample({ ratio: 2 }), // fail both
    ];
    expect(summarize(samples, 'AA')).toEqual({ total: 3, pass: 2, fail: 1 });
    expect(summarize(samples, 'AAA')).toEqual({ total: 3, pass: 1, fail: 2 });
    expect(summarize([], 'AA')).toEqual({ total: 0, pass: 0, fail: 0 });
  });
});

describe('roundRatio', () => {
  it('rounds to two decimals', () => {
    expect(roundRatio(4.5421)).toBe(4.54);
    expect(roundRatio(7.005)).toBe(7.01);
    expect(roundRatio(21)).toBe(21);
  });
});

describe('toReportRows', () => {
  it('projects samples into flat report rows for a level', () => {
    const rows = toReportRows([sample({ ratio: 3.2, large: true, approximate: true })], 'AA');
    expect(rows[0]).toEqual({
      selector: 'p',
      text: 'text',
      fg: 'rgba(0, 0, 0, 1)',
      bg: 'rgba(255, 255, 255, 1)',
      ratio: 3.2,
      required: 3.0,
      level: 'AA',
      large: true,
      approximate: true,
      status: 'pass',
    });
  });
});

describe('buildReport', () => {
  const rows = toReportRows(
    [
      sample({ selector: 'h1', text: 'Title', ratio: 2, large: false }),
      sample({ selector: 'p.note', text: '=cmd,injection', ratio: 8, large: false }),
    ],
    'AA',
  );

  it('builds JSON with indentation and preserved types', () => {
    const json = buildReport(rows, 'json');
    const parsed = JSON.parse(json) as { status: string; ratio: number }[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.status).toBe('fail');
    expect(parsed[0]?.ratio).toBe(2);
  });

  it('builds CSV with header, RFC 4180 rows and anti-injection escaping', () => {
    const csv = buildReport(rows, 'csv');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('selector,text,fg,bg,ratio,required,level,large,approximate,status');
    // Значение начинается с '=' → защита от инъекции добавляет "'" и кавычит из-за запятой.
    expect(csv).toContain('"\'=cmd,injection"');
    expect(lines).toHaveLength(3);
  });

  it('builds plain text with one line per sample', () => {
    const plain = buildReport(rows, 'plain');
    expect(plain).toBe('h1 — 2/4.5 fail\np.note — 8/4.5 pass');
  });

  it('returns just the header for an empty CSV report', () => {
    const csv = buildReport([], 'csv');
    expect(csv).toBe('selector,text,fg,bg,ratio,required,level,large,approximate,status');
  });
});

describe('WebAIM precision (ratio matches reference to 0.01)', () => {
  it.each(WEBAIM_RATIOS)('$name ≈ $expected', ({ fg, bg, expected }) => {
    expect(Math.abs(contrastRatio(fg, bg) - expected)).toBeLessThanOrEqual(0.01);
  });
});

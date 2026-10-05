/**
 * Чистая логика фичи «Инспектор: контраст WCAG» (TASK-014).
 *
 * БЕЗ DOM и `chrome.*`: классификаторы порогов WCAG 2.1, детектор «крупного текста»,
 * агрегатор/фильтр результатов и построитель отчёта (plain/JSON/CSV). Само вычисление
 * `contrastRatio`/`relativeLuminance` живёт в `shared/inspection/dom.ts` и вызывается
 * сборщиком — здесь мы только классифицируем уже посчитанные числа. Это единственный
 * покрытый почти-на-100% модуль фичи (канон «core ~100%»).
 */
import { escapeCsvField, toExport } from '@/shared/export/export';
import type { ExportFormat } from '@/shared/export/export';
import type { Rgba } from '@/shared/inspection/dom';
import type { ContrastSample, TextTypeFilter, WcagLevel } from './types';

export type { WcagLevel } from './types';

/** Порог контраста для обычного текста. */
const THRESHOLD_NORMAL: Readonly<Record<WcagLevel, number>> = { AA: 4.5, AAA: 7.0 };
/** Порог контраста для крупного текста. */
const THRESHOLD_LARGE: Readonly<Record<WcagLevel, number>> = { AA: 3.0, AAA: 4.5 };

/**
 * Требуемый порог контраста для уровня и типа текста. Крупный текст — мягче:
 * AA 3.0 / AAA 4.5; обычный — AA 4.5 / AAA 7.0.
 */
export function threshold(level: WcagLevel, large: boolean): number {
  return large ? THRESHOLD_LARGE[level] : THRESHOLD_NORMAL[level];
}

/**
 * «Крупный текст» по WCAG 2.1 в вычисленных CSS-px: ≥24px (эквивалент 18pt) ИЛИ
 * ≥18.66px (14pt) при жирном начертании (weight ≥ 700). Границы включительны.
 */
export function isLargeText(px: number, weight: number): boolean {
  return px >= 24 || (px >= 18.66 && weight >= 700);
}

/**
 * Классификация одной пары: `pass`, если коэффициент не ниже требуемого порога
 * (граница включительна — ровно 4.5 при AA-обычном проходит), иначе `fail`.
 */
export function classify(sample: ContrastSample, level: WcagLevel): 'pass' | 'fail' {
  return sample.ratio >= threshold(level, sample.large) ? 'pass' : 'fail';
}

/** Проходит ли образец фильтр по типу текста (без пересчёта). */
export function matchesTextType(sample: ContrastSample, filter: TextTypeFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'large' ? sample.large : !sample.large;
}

/** Опции фильтрации выборки (реактивно, без повторного скана). */
export interface FilterOptions {
  readonly level: WcagLevel;
  readonly textType: TextTypeFilter;
  readonly onlyFails: boolean;
}

/**
 * Отбирает образцы по типу текста и (опционально) только провалившиеся на уровне.
 * Не мутирует и не пересканирует — тот же массив классифицируется под новый фильтр.
 */
export function filterSamples(
  samples: readonly ContrastSample[],
  opts: FilterOptions,
): ContrastSample[] {
  return samples.filter((s) => {
    if (!matchesTextType(s, opts.textType)) return false;
    if (opts.onlyFails && classify(s, opts.level) === 'pass') return false;
    return true;
  });
}

/** Сводка pass/fail по выборке для заданного уровня. */
export interface ContrastSummary {
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
}

/** Считает pass/fail по всем образцам на выбранном уровне (без учёта фильтров UI). */
export function summarize(samples: readonly ContrastSample[], level: WcagLevel): ContrastSummary {
  let pass = 0;
  for (const s of samples) {
    if (classify(s, level) === 'pass') pass += 1;
  }
  return { total: samples.length, pass, fail: samples.length - pass };
}

/** Округляет коэффициент до 2 знаков (для отчёта/отображения). */
export function roundRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}

/** Форматирует `Rgba` в строку `rgba(r, g, b, a)` (локальный, без зависимости от DOM). */
function formatRgba(c: Rgba): string {
  return `rgba(${String(c.r)}, ${String(c.g)}, ${String(c.b)}, ${String(c.a)})`;
}

/** Строка отчёта — плоская, сериализуемая проекция образца под уровень. */
export interface ContrastReportRow {
  readonly selector: string;
  readonly text: string;
  readonly fg: string;
  readonly bg: string;
  readonly ratio: number;
  readonly required: number;
  readonly level: WcagLevel;
  readonly large: boolean;
  readonly approximate: boolean;
  readonly status: 'pass' | 'fail';
}

/** Порядок и заголовки колонок отчёта — единый источник правды для CSV/plain. */
const REPORT_COLUMNS = [
  'selector',
  'text',
  'fg',
  'bg',
  'ratio',
  'required',
  'level',
  'large',
  'approximate',
  'status',
] as const;

/** Строит строки отчёта из образцов под выбранный уровень. */
export function toReportRows(
  samples: readonly ContrastSample[],
  level: WcagLevel,
): ContrastReportRow[] {
  return samples.map((s) => ({
    selector: s.selector,
    text: s.text,
    fg: formatRgba(s.fg),
    bg: formatRgba(s.bg),
    ratio: roundRatio(s.ratio),
    required: threshold(level, s.large),
    level,
    large: s.large,
    approximate: s.approximate,
    status: classify(s, level),
  }));
}

/** Значения строки в порядке колонок (для табличных форматов). */
function rowValues(row: ContrastReportRow): string[] {
  return [
    row.selector,
    row.text,
    row.fg,
    row.bg,
    String(row.ratio),
    String(row.required),
    row.level,
    String(row.large),
    String(row.approximate),
    row.status,
  ];
}

/**
 * Собирает отчёт в выбранном формате:
 *  - `json`  — массив строк-объектов с отступом (человекочитаемо, типы сохранены);
 *  - `csv`   — RFC 4180, много колонок, поля через `escapeCsvField` (анти-инъекция);
 *  - `plain` — по строке на образец `селектор — ratio/required status`, через `toExport`.
 */
export function buildReport(rows: readonly ContrastReportRow[], format: ExportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(rows, null, 2);
    case 'csv': {
      const header = REPORT_COLUMNS.map((c) => escapeCsvField(c)).join(',');
      const body = rows.map((r) =>
        rowValues(r)
          .map((v) => escapeCsvField(v))
          .join(','),
      );
      return [header, ...body].join('\r\n');
    }
    case 'plain':
      return toExport(
        {
          rows: rows.map(
            (r) => `${r.selector} — ${String(r.ratio)}/${String(r.required)} ${r.status}`,
          ),
        },
        'plain',
      );
  }
}

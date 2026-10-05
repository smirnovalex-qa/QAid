/**
 * Чистая доменная логика инспектора шрифтов (TASK-016). Без DOM и `chrome.*`:
 * нормализация `font-family`, классификатор источника (web/local/unknown) по
 * переданному набору загруженных семейств, агрегатор `FontUsage` и форматтер
 * отчёта (plain/JSON/CSV). Классификатор принимает загруженные семейства ДАННЫМИ
 * (а не читает `document.fonts`), поэтому полностью тестируется без окружения.
 * Комментарии — на русском, идентификаторы — на английском.
 */
import { escapeCsvField, toExport } from '@/shared/export/export';
import type { ExportFormat } from '@/shared/export/export';
import type { FontSample, FontSource, FontUsage, FontUsageLocation, FontsSort } from './types';

/**
 * Снимает парные обрамляющие кавычки (`'` или `"`) и обрезает пробелы. Одиночная
 * или непарная кавычка не считается обрамлением — строка возвращается как есть.
 */
export function stripQuotes(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

/**
 * Разбирает CSS-значение `font-family` в массив-цепочку семейств: делит по
 * запятым, снимает кавычки, отбрасывает пустые токены. Пример:
 * `'"Helvetica Neue", Arial, sans-serif'` → `['Helvetica Neue', 'Arial', 'sans-serif']`.
 */
export function normalizeFamily(raw: string): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((part) => stripQuotes(part))
    .filter((part) => part !== '');
}

/** Канонизирует имя семейства для сравнения: снятие кавычек + нижний регистр. */
export function canonicalFamily(raw: string): string {
  return stripQuotes(raw).toLowerCase();
}

/**
 * Классифицирует источник семейства по набору загруженных (веб-)семейств.
 * Пустое имя → `unknown` (нечего атрибутировать); совпадение с загруженным
 * `@font-face` → `web`; иначе → `local` (системный/локальный шрифт).
 */
export function classifySource(family: string, loadedFamilies: Set<string>): FontSource {
  const key = canonicalFamily(family);
  if (key === '') return 'unknown';
  return loadedFamilies.has(key) ? 'web' : 'local';
}

/** Числовое значение CSS-размера (ведущее число); нечисловое → `+Infinity` (в хвост). */
function numericLead(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

/** Уникализирует и сортирует размеры/веса по числовому значению (12px < 14px < 16px). */
function sortNumeric(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => {
    const diff = numericLead(a) - numericLead(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

/** Уникализирует и сортирует начертания лексикографически. */
function sortAlpha(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

/** Внутренний накопитель агрегата по одному семейству. */
interface UsageAccumulator {
  family: string;
  source: FontSource;
  count: number;
  sizes: Set<string>;
  weights: Set<string>;
  styles: Set<string>;
  usages: FontUsageLocation[];
}

/**
 * Агрегирует сырые сэмплы в список {@link FontUsage} по эффективному семейству:
 * частота, наборы применённых размеров/весов/начертаний и места использования.
 * Источник берётся из {@link classifySource}; при недоступном `document.fonts`
 * (`fontsApiAvailable === false`) деградирует до `unknown` для всех семейств.
 */
export function aggregateUsages(
  samples: readonly FontSample[],
  loadedFamilies: Set<string>,
  fontsApiAvailable: boolean,
): FontUsage[] {
  const byFamily = new Map<string, UsageAccumulator>();

  for (const sample of samples) {
    const source: FontSource = fontsApiAvailable
      ? classifySource(sample.family, loadedFamilies)
      : 'unknown';
    const key = canonicalFamily(sample.family);
    let acc = byFamily.get(key);
    if (acc === undefined) {
      acc = {
        family: sample.family === '' ? key : sample.family,
        source,
        count: 0,
        sizes: new Set<string>(),
        weights: new Set<string>(),
        styles: new Set<string>(),
        usages: [],
      };
      byFamily.set(key, acc);
    }
    acc.count += 1;
    if (sample.fontSize !== '') acc.sizes.add(sample.fontSize);
    if (sample.fontWeight !== '') acc.weights.add(sample.fontWeight);
    if (sample.fontStyle !== '') acc.styles.add(sample.fontStyle);
    acc.usages.push({
      selector: sample.selector,
      text: sample.text,
      fontSize: sample.fontSize,
      fontWeight: sample.fontWeight,
      fontStyle: sample.fontStyle,
    });
  }

  return Array.from(byFamily.values()).map((acc) => ({
    family: acc.family,
    source: acc.source,
    count: acc.count,
    sizes: sortNumeric(acc.sizes),
    weights: sortNumeric(acc.weights),
    styles: sortAlpha(acc.styles),
    usages: acc.usages,
  }));
}

/** Сортирует список семейств: по частоте (убыв.) или по имени (возр.). Не мутирует вход. */
export function sortUsages(usages: readonly FontUsage[], sort: FontsSort): FontUsage[] {
  const copy = Array.from(usages);
  if (sort === 'name') {
    copy.sort((a, b) => a.family.localeCompare(b.family));
  } else {
    copy.sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
  }
  return copy;
}

/** Порядок и заголовки столбцов табличного отчёта. */
const REPORT_HEADERS: readonly string[] = [
  'family',
  'source',
  'count',
  'sizes',
  'weights',
  'styles',
];

/** Проекция агрегата в строковые ячейки отчёта (в порядке {@link REPORT_HEADERS}). */
function reportCells(u: FontUsage): string[] {
  return [
    u.family,
    u.source,
    String(u.count),
    u.sizes.join(' '),
    u.weights.join(' '),
    u.styles.join(' '),
  ];
}

/** Однострочное человекочитаемое представление семейства для plain-отчёта. */
function plainLine(u: FontUsage): string {
  const sizes = u.sizes.join(', ');
  const weights = u.weights.join(', ');
  const styles = u.styles.join(', ');
  return `${u.family} [${u.source}] x${String(u.count)} - sizes: ${sizes}; weights: ${weights}; styles: ${styles}`;
}

/** CSV-отчёт по RFC 4180 (через {@link escapeCsvField}): заголовок + строка на семейство. */
function toCsvReport(usages: readonly FontUsage[]): string {
  const header = REPORT_HEADERS.map((h) => escapeCsvField(h)).join(',');
  const lines = usages.map((u) =>
    reportCells(u)
      .map((c) => escapeCsvField(c))
      .join(','),
  );
  return [header, ...lines].join('\r\n');
}

/** JSON-проекция агрегата (без внутренних мест использования — компактный отчёт). */
function jsonRow(u: FontUsage): Record<string, unknown> {
  return {
    family: u.family,
    source: u.source,
    count: u.count,
    sizes: u.sizes,
    weights: u.weights,
    styles: u.styles,
  };
}

/**
 * Форматирует отчёт по семействам в выбранный формат. Plain — через `toExport`
 * (по строке на семейство), JSON — компактная проекция, CSV — многостолбцовый
 * RFC-4180 через `escapeCsvField`.
 */
export function formatReport(usages: readonly FontUsage[], format: ExportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(usages.map(jsonRow), null, 2);
    case 'csv':
      return toCsvReport(usages);
    case 'plain':
      return toExport({ rows: usages.map(plainLine) }, 'plain');
  }
}

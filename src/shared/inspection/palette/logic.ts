/**
 * Чистая логика палитры цветов (TASK-015): конвертации между представлениями
 * (RGBA → HEX8/RGB(A)/HSL(A)), дедуплицирующий агрегатор `PaletteHit[] →
 * PaletteEntry[]`, сортировки и экспорт. БЕЗ DOM и `chrome.*`.
 *
 * Единый источник ПАРСИНГА — `parseColor` из слоя инспекции (реэкспорт ниже);
 * здесь только конвертации МЕЖДУ представлениями и агрегация. Комментарии — на
 * русском, идентификаторы — на английском.
 */
import { contrastRatio, relativeLuminance } from '@/shared/inspection/dom';
import type { Rgba } from '@/shared/inspection/dom';
import { toExport } from '@/shared/export/export';
import type { ExportFormat } from '@/shared/export/export';
import type { ColorFormat, ColorUsage, PaletteEntry, PaletteHit, PaletteSort } from './types';

// Реэкспорт единственного парсера цвета — фичам удобно брать его отсюда, но
// собственной реализации парсинга здесь нет (инвариант «один источник истины»).
export { parseColor } from '@/shared/inspection/dom';

/** Число мест использования (селектор+свойство), показываемых на свотч. */
export const PALETTE_MAX_USAGES = 8;

/** Двухзначный HEX для канала 0..255. */
function channelToHex(channel: number): string {
  return channel.toString(16).padStart(2, '0');
}

/**
 * Форматирует альфу компактно: целые без дробной части, иначе до 3 знаков без
 * хвостовых нулей (`1` → `'1'`, `0.5` → `'0.5'`, `0.3333` → `'0.333'`).
 */
function formatAlpha(a: number): string {
  const rounded = Math.round(a * 1000) / 1000;
  return String(rounded);
}

/**
 * RGBA → HEX. При alpha=1 — 6-значный `#rrggbb`; иначе HEX8 `#rrggbbaa`
 * (альфа масштабируется 0..1 → 0..255). Строчные буквы (канон `parseColor`).
 */
export function toHex(c: Rgba): string {
  const base = `#${channelToHex(c.r)}${channelToHex(c.g)}${channelToHex(c.b)}`;
  if (c.a >= 1) return base;
  return `${base}${channelToHex(Math.round(c.a * 255))}`;
}

/** RGBA → `rgb(r, g, b)` (alpha=1) или `rgba(r, g, b, a)`. */
export function toRgbString(c: Rgba): string {
  if (c.a >= 1) return `rgb(${String(c.r)}, ${String(c.g)}, ${String(c.b)})`;
  return `rgba(${String(c.r)}, ${String(c.g)}, ${String(c.b)}, ${formatAlpha(c.a)})`;
}

/**
 * RGB → HSL. Возвращает `h` в `[0,360)` (для серого — 0), `s`/`l` в `[0,1]`.
 * Чистая обратная к `hslToRgb` из слоя (в пределах представимости).
 */
export function rgbToHsl(c: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** RGBA → `hsl(h, s%, l%)` (alpha=1) или `hsla(h, s%, l%, a)`. */
export function toHslString(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c);
  const hh = Math.round(h);
  const ss = Math.round(s * 100);
  const ll = Math.round(l * 100);
  if (c.a >= 1) return `hsl(${String(hh)}, ${String(ss)}%, ${String(ll)}%)`;
  return `hsla(${String(hh)}, ${String(ss)}%, ${String(ll)}%, ${formatAlpha(c.a)})`;
}

/**
 * Выбирает читаемый цвет подписи (`#000`/`#fff`) для свотча с фоном `bg`:
 * тот из чёрного/белого, у кого выше контраст к фону (WCAG). Alpha фона
 * игнорируется (свотч показывается на непрозрачной подложке).
 */
export function readableLabelColor(bg: { r: number; g: number; b: number }): '#000' | '#fff' {
  const onBlack = contrastRatio({ r: 0, g: 0, b: 0 }, bg);
  const onWhite = contrastRatio({ r: 255, g: 255, b: 255 }, bg);
  return onBlack >= onWhite ? '#000' : '#fff';
}

/** Значение записи в выбранном формате (для копирования/экспорта/подписи). */
export function formatValue(entry: PaletteEntry, format: ColorFormat): string {
  switch (format) {
    case 'hex':
      return entry.hex;
    case 'rgb':
      return entry.rgb;
    case 'hsl':
      return entry.hsl;
  }
}

/** Каноничный ключ дедупликации: точное совпадение включая альфу. */
function canonicalKey(c: Rgba): string {
  return `${String(c.r)},${String(c.g)},${String(c.b)},${formatAlpha(c.a)}`;
}

interface Bucket {
  readonly rgba: Rgba;
  count: number;
  readonly usages: Map<string, ColorUsage>;
}

/**
 * Агрегирует «сырые» наблюдения в дедуплицированные записи: группировка по
 * каноничному значению (включая альфу), подсчёт частоты и топ-N мест
 * использования (селектор+свойство), усечённых со счётчиком переполнения.
 * Порядок записей на выходе — как встретились (сортировка — отдельно).
 */
export function aggregatePalette(
  hits: readonly PaletteHit[],
  maxUsages: number = PALETTE_MAX_USAGES,
): PaletteEntry[] {
  const buckets = new Map<string, Bucket>();

  for (const hit of hits) {
    const key = canonicalKey(hit.rgba);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { rgba: hit.rgba, count: 0, usages: new Map<string, ColorUsage>() };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const uKey = `${hit.selector}|${hit.property}`;
    const usage = bucket.usages.get(uKey);
    if (usage === undefined) {
      bucket.usages.set(uKey, { selector: hit.selector, property: hit.property, count: 1 });
    } else {
      bucket.usages.set(uKey, { ...usage, count: usage.count + 1 });
    }
  }

  const entries: PaletteEntry[] = [];
  for (const bucket of buckets.values()) {
    const sortedUsages = [...bucket.usages.values()].sort(
      (a, b) => b.count - a.count || a.selector.localeCompare(b.selector),
    );
    const usages = sortedUsages.slice(0, maxUsages);
    entries.push({
      rgba: bucket.rgba,
      hex: toHex(bucket.rgba),
      rgb: toRgbString(bucket.rgba),
      hsl: toHslString(bucket.rgba),
      count: bucket.count,
      usages,
      usagesOverflow: sortedUsages.length - usages.length,
    });
  }
  return entries;
}

/** Сравнитель по частоте (убыв.); тай-брейк по HEX для стабильности. */
function byFrequency(a: PaletteEntry, b: PaletteEntry): number {
  return b.count - a.count || a.hex.localeCompare(b.hex);
}

/** Сравнитель по оттенку (возр.); серые (s=0) идут первыми. */
function byHue(a: PaletteEntry, b: PaletteEntry): number {
  return rgbToHsl(a.rgba).h - rgbToHsl(b.rgba).h || a.hex.localeCompare(b.hex);
}

/** Сравнитель по светлоте (возр., тёмные → светлые) по WCAG-яркости. */
function byLightness(a: PaletteEntry, b: PaletteEntry): number {
  return relativeLuminance(a.rgba) - relativeLuminance(b.rgba) || a.hex.localeCompare(b.hex);
}

/** Возвращает НОВЫЙ отсортированный массив записей в заданном порядке. */
export function sortPalette(entries: readonly PaletteEntry[], sort: PaletteSort): PaletteEntry[] {
  const copy = [...entries];
  switch (sort) {
    case 'frequency':
      return copy.sort(byFrequency);
    case 'hue':
      return copy.sort(byHue);
    case 'lightness':
      return copy.sort(byLightness);
  }
}

/** JSON-экспорт палитры: массив `{ hex, rgb, hsl, count, usages }`. */
export function paletteToJson(entries: readonly PaletteEntry[]): string {
  const rows = entries.map((e) => ({
    hex: e.hex,
    rgb: e.rgb,
    hsl: e.hsl,
    count: e.count,
    usages: e.usages,
  }));
  return JSON.stringify(rows, null, 2);
}

/**
 * Экспорт палитры в plain/JSON/CSV. JSON — структурированный массив
 * (см. `paletteToJson`); plain/CSV — одностолбцовый список значений в выбранном
 * цветовом формате через общий хелпер экспорта (TASK-008).
 */
export function paletteExport(
  entries: readonly PaletteEntry[],
  format: ExportFormat,
  colorFormat: ColorFormat,
): string {
  if (format === 'json') return paletteToJson(entries);
  const rows = entries.map((e) => formatValue(e, colorFormat));
  return toExport({ rows, header: 'color' }, format);
}

/**
 * Общие типы фичи «Инспектор: палитра цветов» (TASK-015).
 *
 * Вынесены отдельно, чтобы чистая логика (`logic.ts`), сборщик (`collector.ts`),
 * слой настроек и UI зависели от единого контракта, а не друг от друга. Все
 * структуры JSON-сериализуемы (проходят через инспекционный RPC).
 */
import type { Rgba } from '@/shared/inspection/dom';

/** Формат представления цвета в UI и при копировании. */
export type ColorFormat = 'hex' | 'rgb' | 'hsl';

/** Порядок сортировки палитры. */
export type PaletteSort = 'frequency' | 'hue' | 'lightness';

/** Одно «сырое» наблюдение цвета сборщиком: значение + место использования. */
export interface PaletteHit {
  /** Каноничный RGBA (после `parseColor`). */
  readonly rgba: Rgba;
  /** Лёгкий селектор элемента (`tag#id.class`). */
  readonly selector: string;
  /** CSS-свойство-источник (`color`, `background-color`, `box-shadow`, …). */
  readonly property: string;
}

/** Агрегированное место использования цвета: селектор + свойство + счётчик. */
export interface ColorUsage {
  readonly selector: string;
  readonly property: string;
  readonly count: number;
}

/** Дедуплицированная запись палитры: одно каноничное значение цвета. */
export interface PaletteEntry {
  /** Каноничный RGBA. */
  readonly rgba: Rgba;
  /** HEX (6-значный при alpha=1, иначе HEX8). */
  readonly hex: string;
  /** `rgb()`/`rgba()`-строка. */
  readonly rgb: string;
  /** `hsl()`/`hsla()`-строка. */
  readonly hsl: string;
  /** Сколько всего раз цвет встретился (сумма по местам использования). */
  readonly count: number;
  /** Топ-N мест использования (по убыванию частоты). */
  readonly usages: readonly ColorUsage[];
  /** Число групп использования, не вошедших в топ-N (усечение). */
  readonly usagesOverflow: number;
}

/** Результат сбора палитры по корню (страница/элемент). */
export interface PaletteScanData {
  /** Дедуплицированные записи (по умолчанию отсортированы по частоте). */
  readonly entries: readonly PaletteEntry[];
  /** Сколько элементов обошёл сборщик (для инфо-строки). */
  readonly elements: number;
}

/** Персистентное состояние фичи (через слой настроек TASK-005). */
export interface PaletteSettingsState {
  readonly format: ColorFormat;
  readonly sort: PaletteSort;
}

export const PALETTE_DEFAULTS: PaletteSettingsState = { format: 'hex', sort: 'frequency' };

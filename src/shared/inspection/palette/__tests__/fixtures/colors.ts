// Фикстуры цветов и наблюдений для тестов палитры (TASK-015).
import type { Rgba } from '@/shared/inspection/dom';
import type { PaletteHit } from '../../types';

export const RED: Rgba = { r: 255, g: 0, b: 0, a: 1 };
export const GREEN: Rgba = { r: 0, g: 128, b: 0, a: 1 };
export const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 1 };
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
export const GRAY: Rgba = { r: 128, g: 128, b: 128, a: 1 };
export const SEMI_RED: Rgba = { r: 255, g: 0, b: 0, a: 0.5 };

/** Набор наблюдений: red встречается 3 раза (2 места), blue — 1 раз. */
export const HITS: readonly PaletteHit[] = [
  { rgba: RED, selector: 'button.primary', property: 'background-color' },
  { rgba: RED, selector: 'button.primary', property: 'background-color' },
  { rgba: RED, selector: 'a', property: 'color' },
  { rgba: BLUE, selector: 'h1', property: 'color' },
];

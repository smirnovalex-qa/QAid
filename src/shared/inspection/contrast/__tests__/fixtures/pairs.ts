/**
 * Тест-векторы для «Инспектора: контраст WCAG» (TASK-014).
 *
 * Три набора:
 *  - CLASSIFY_VECTORS — граничные коэффициенты вокруг порогов AA/AAA (4.5/3.0/7.0/4.5);
 *  - LARGE_VECTORS — детекция «крупного текста» по px/weight (24px, 18.66px+bold);
 *  - WEBAIM_RATIOS — эталонные пары цветов с коэффициентом из WebAIM (проверка до 0.01).
 */
import type { Rgba } from '@/shared/inspection/dom';

/** Ожидаемая классификация коэффициента на обоих уровнях. */
export interface ClassifyVector {
  readonly name: string;
  readonly ratio: number;
  readonly large: boolean;
  readonly aa: 'pass' | 'fail';
  readonly aaa: 'pass' | 'fail';
}

/** Границы включительны: ровно порог проходит, на 0.01 ниже — проваливает. */
export const CLASSIFY_VECTORS: readonly ClassifyVector[] = [
  { name: 'AA normal boundary 4.5', ratio: 4.5, large: false, aa: 'pass', aaa: 'fail' },
  { name: 'below AA normal 4.49', ratio: 4.49, large: false, aa: 'fail', aaa: 'fail' },
  { name: 'AA large boundary 3.0', ratio: 3.0, large: true, aa: 'pass', aaa: 'fail' },
  { name: 'below AA large 2.99', ratio: 2.99, large: true, aa: 'fail', aaa: 'fail' },
  { name: 'AAA normal boundary 7.0', ratio: 7.0, large: false, aa: 'pass', aaa: 'pass' },
  { name: 'below AAA normal 6.99', ratio: 6.99, large: false, aa: 'pass', aaa: 'fail' },
  { name: 'AAA large boundary 4.5', ratio: 4.5, large: true, aa: 'pass', aaa: 'pass' },
  { name: 'below AAA large 4.49', ratio: 4.49, large: true, aa: 'pass', aaa: 'fail' },
  { name: 'max contrast 21', ratio: 21, large: false, aa: 'pass', aaa: 'pass' },
  { name: 'min contrast 1', ratio: 1, large: false, aa: 'fail', aaa: 'fail' },
];

/** Детекция крупного текста: ≥24px ИЛИ (≥18.66px И weight≥700). */
export interface LargeVector {
  readonly px: number;
  readonly weight: number;
  readonly large: boolean;
}

export const LARGE_VECTORS: readonly LargeVector[] = [
  { px: 24, weight: 400, large: true }, // ровно 24px
  { px: 23.99, weight: 400, large: false }, // чуть ниже 24px, не bold
  { px: 18.66, weight: 700, large: true }, // ровно 18.66px + bold
  { px: 18.66, weight: 400, large: false }, // 18.66px, но не bold
  { px: 18.65, weight: 700, large: false }, // чуть ниже 18.66px, хоть и bold
  { px: 19, weight: 900, large: true }, // жирнее bold
  { px: 40, weight: 100, large: true }, // очень крупный, тонкий
  { px: 12, weight: 700, large: false }, // мелкий bold — не крупный
];

/** Эталонная пара «цвет/фон» с коэффициентом из WebAIM (точность до 0.01). */
export interface RatioVector {
  readonly name: string;
  readonly fg: Rgba;
  readonly bg: Rgba;
  readonly expected: number;
}

const rgb = (r: number, g: number, b: number): Rgba => ({ r, g, b, a: 1 });

export const WEBAIM_RATIOS: readonly RatioVector[] = [
  { name: 'black on white', fg: rgb(0, 0, 0), bg: rgb(255, 255, 255), expected: 21.0 },
  { name: 'white on white', fg: rgb(255, 255, 255), bg: rgb(255, 255, 255), expected: 1.0 },
  { name: '#767676 on white', fg: rgb(118, 118, 118), bg: rgb(255, 255, 255), expected: 4.54 },
  { name: '#595959 on white', fg: rgb(89, 89, 89), bg: rgb(255, 255, 255), expected: 7.0 },
  {
    name: '#777 on white (fails AA)',
    fg: rgb(119, 119, 119),
    bg: rgb(255, 255, 255),
    expected: 4.48,
  },
];

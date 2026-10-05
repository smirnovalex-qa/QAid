/**
 * Чистая геометрия фичи «Инспектор: линейка / измеритель» (TASK-018).
 *
 * БЕЗ DOM и `chrome.*`: вся математика — на простых `Rect` (`{x,y,width,height}`),
 * не на DOM-узлах. Сборщик передаёт снимки прямоугольников в эти функции, поэтому
 * измерения полностью юнит-тестируются без браузера. Это покрытый почти-на-100%
 * модуль фичи (канон «core ~100%»). Модуль пригоден и как питание будущей свободной
 * линейки оркестратора: `measureBetween` работает над любыми двумя `Rect`,
 * включая прямоугольник, который тянут мышью.
 *
 * ПРАВИЛО ОКРУГЛЕНИЯ: субпиксельные значения `getBoundingClientRect` округляются до
 * 0.5px (`roundHalf`) — это компромисс между честностью (полупиксельная вёрстка
 * реальна на HiDPI) и читаемостью подписей. Допуск выравнивания кромок/центров —
 * тот же 0.5px: кромки считаются совпавшими, если их разница по модулю < 0.5px.
 */
import type {
  AlignmentFlags,
  DragMeasurement,
  EdgeDeltas,
  Measurement,
  Point,
  Rect,
  RulerUnits,
} from './types';
import { DEFAULT_ROOT_PX } from './types';

/** Допуск выравнивания и шаг округления, px. */
const HALF = 0.5;

/** Округляет число до ближайшего 0.5px (документированное правило точности). */
export function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Правая кромка прямоугольника (`x + width`). */
function right(r: Rect): number {
  return r.x + r.width;
}

/** Нижняя кромка прямоугольника (`y + height`). */
function bottom(r: Rect): number {
  return r.y + r.height;
}

/**
 * Знаковые разницы соответствующих кромок (`b − a`). Ноль — кромки совпадают.
 * Положительная `left`/`top` — B правее/ниже; удобно для проверки выравнивания.
 */
export function edges(a: Rect, b: Rect): EdgeDeltas {
  return {
    left: b.x - a.x,
    right: right(b) - right(a),
    top: b.y - a.y,
    bottom: bottom(b) - bottom(a),
  };
}

/**
 * Длина пересечения проекций прямоугольников на каждую ось (0, если проекции не
 * пересекаются). `overlap.x > 0` означает, что элементы перекрываются по горизонтали.
 */
export function overlap(a: Rect, b: Rect): { x: number; y: number } {
  const x = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const y = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/** Смещение центра B относительно центра A по обеим осям (`centerB − centerA`). */
export function centerDelta(a: Rect, b: Rect): { x: number; y: number } {
  return {
    x: b.x + b.width / 2 - (a.x + a.width / 2),
    y: b.y + b.height / 2 - (a.y + a.height / 2),
  };
}

/** Совпали ли два значения в пределах допуска выравнивания (0.5px). */
function isAligned(delta: number): boolean {
  return Math.abs(delta) < HALF;
}

/**
 * Полное измерение между двумя прямоугольниками: зазоры/перекрытия по осям,
 * разницы кромок, смещение центров и флаги выравнивания. Все числовые поля
 * округлены до 0.5px; флаги `aligned` считаются по НЕокруглённым разницам с
 * допуском 0.5px (чтобы 0.49px тоже читалось как «выровнено»).
 */
export function measureBetween(a: Rect, b: Rect): Measurement {
  const ov = overlap(a, b);
  const e = edges(a, b);
  const c = centerDelta(a, b);

  // Зазор по оси = отрицательная часть «сырого» пересечения проекций.
  const rawX = Math.min(right(a), right(b)) - Math.max(a.x, b.x);
  const rawY = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y);

  const aligned: AlignmentFlags = {
    left: isAligned(e.left),
    right: isAligned(e.right),
    top: isAligned(e.top),
    bottom: isAligned(e.bottom),
    centerX: isAligned(c.x),
    centerY: isAligned(c.y),
  };

  return {
    gapX: roundHalf(Math.max(0, -rawX)),
    gapY: roundHalf(Math.max(0, -rawY)),
    overlapX: roundHalf(ov.x),
    overlapY: roundHalf(ov.y),
    edges: {
      left: roundHalf(e.left),
      right: roundHalf(e.right),
      top: roundHalf(e.top),
      bottom: roundHalf(e.bottom),
    },
    centerDelta: { x: roundHalf(c.x), y: roundHalf(c.y) },
    aligned,
  };
}

/** Округляет угол до 0.1° (читаемость подписи свободной мерки). */
function roundAngle(deg: number): number {
  return Math.round(deg * 10) / 10;
}

/**
 * Свободное (drag) измерение между двумя точками A→B (TASK-033). Чистая геометрия
 * над `Point`, не над DOM: тот же модуль питает и клики пикера, и прямоугольник,
 * который тянут мышью. Линейные величины округлены до 0.5px (`roundHalf`), угол — до
 * 0.1° (`atan2`, диапазон −180..180: 0 — вправо, положительный — вниз, т.к. экранная
 * ось Y растёт вниз). `width`/`height` — модули смещения (габариты bbox мерки).
 */
export function measureVector(a: Point, b: Point): DragMeasurement {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    dx: roundHalf(dx),
    dy: roundHalf(dy),
    width: roundHalf(Math.abs(dx)),
    height: roundHalf(Math.abs(dy)),
    length: roundHalf(length),
    angleDeg: roundAngle(angleDeg),
  };
}

/**
 * Плоский текстовый отчёт о свободном измерении (для копирования, TASK-008). Длина/
 * ΔX/ΔY/габариты — в выбранных единицах; угол — всегда в градусах (единицы длины к
 * нему неприменимы).
 */
export function formatVector(
  m: DragMeasurement,
  units: RulerUnits,
  rootPx: number = DEFAULT_ROOT_PX,
): string {
  const fv = (px: number): string => formatValue(px, units, rootPx);
  return [
    `length: ${fv(m.length)}`,
    `delta: x=${fv(m.dx)} y=${fv(m.dy)}`,
    `size: ${fv(m.width)} × ${fv(m.height)}`,
    `angle: ${String(m.angleDeg)}°`,
  ].join('\n');
}

/** Перевод px → rem по базовому размеру корневого шрифта (>0; иначе трактуем как 16). */
export function pxToRem(px: number, rootPx: number = DEFAULT_ROOT_PX): number {
  const base = rootPx > 0 ? rootPx : DEFAULT_ROOT_PX;
  return px / base;
}

/**
 * Форматирует одно значение в выбранных единицах. `px` округляется до 0.5px;
 * `rem` — до 3 знаков (достаточно для читаемости при base 16). Возвращает строку с
 * суффиксом единиц.
 */
export function formatValue(
  px: number,
  units: RulerUnits,
  rootPx: number = DEFAULT_ROOT_PX,
): string {
  if (units === 'rem') {
    const rem = Math.round(pxToRem(px, rootPx) * 1000) / 1000;
    return `${String(rem)}rem`;
  }
  return `${String(roundHalf(px))}px`;
}

/**
 * Плоский текстовый отчёт об измерении (для копирования, TASK-008). По строке на
 * величину: зазоры, перекрытия, разницы кромок, смещение центров, флаги выравнивания.
 */
export function formatMeasurement(
  m: Measurement,
  units: RulerUnits,
  rootPx: number = DEFAULT_ROOT_PX,
): string {
  const fv = (px: number): string => formatValue(px, units, rootPx);
  const alignedList = (Object.keys(m.aligned) as (keyof AlignmentFlags)[]).filter(
    (k) => m.aligned[k],
  );
  return [
    `gap: x=${fv(m.gapX)} y=${fv(m.gapY)}`,
    `overlap: x=${fv(m.overlapX)} y=${fv(m.overlapY)}`,
    `edges: left=${fv(m.edges.left)} right=${fv(m.edges.right)} top=${fv(m.edges.top)} bottom=${fv(m.edges.bottom)}`,
    `center: x=${fv(m.centerDelta.x)} y=${fv(m.centerDelta.y)}`,
    `aligned: ${alignedList.length > 0 ? alignedList.join(', ') : 'none'}`,
  ].join('\n');
}

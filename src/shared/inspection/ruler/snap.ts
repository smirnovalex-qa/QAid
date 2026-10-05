/**
 * Чистое примагничивание концов свободной мерки к кромкам элементов (TASK-033).
 *
 * БЕЗ DOM и `chrome.*`: работает над снимками прямоугольников (`Rect[]`) и числами,
 * поэтому полностью юнит-тестируется без браузера. Content-инструмент линейки
 * (`content/inspection/measure-tool`) один раз на старт drag собирает кромки видимых
 * элементов (с бюджетом узлов) и на каждый `mousemove` притягивает конец мерки к
 * ближайшей кромке в пределах порога — считая от готового набора кандидатов, а не
 * сканируя дерево заново (перф §9).
 *
 * Оси независимы: X притягивается к вертикальным кромкам (left/right прямоугольников),
 * Y — к горизонтальным (top/bottom). Это даёт привычное поведение «прилипания» к
 * сетке кромок, знакомое по графредакторам.
 */
import type { Point, Rect } from './types';

/** Набор координат кромок-кандидатов: вертикальные (`xs`) и горизонтальные (`ys`). */
export interface EdgeCandidates {
  /** X-координаты вертикальных кромок (левые/правые границы). Отсортированы, без дублей. */
  readonly xs: readonly number[];
  /** Y-координаты горизонтальных кромок (верхние/нижние границы). Отсортированы, без дублей. */
  readonly ys: readonly number[];
}

/** Результат примагничивания точки: новые координаты и флаги, сработал ли snap по оси. */
export interface SnapResult {
  readonly point: Point;
  readonly snappedX: boolean;
  readonly snappedY: boolean;
}

/** Возрастающая сортировка с удалением дублей (кромки часто совпадают у смежных узлов). */
function sortedUnique(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || v !== last) out.push(v);
  }
  return out;
}

/**
 * Собирает координаты кромок из набора прямоугольников: у каждого — левая/правая (в
 * `xs`) и верхняя/нижняя (в `ys`) границы. Результат отсортирован и без дублей —
 * удобно для поиска ближайшей и стабильно для тестов.
 */
export function collectEdges(rects: readonly Rect[]): EdgeCandidates {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rects) {
    xs.push(r.x, r.x + r.width);
    ys.push(r.y, r.y + r.height);
  }
  return { xs: sortedUnique(xs), ys: sortedUnique(ys) };
}

/**
 * Ближайший кандидат к `value` в пределах порога `threshold` (px). Если ближайший
 * дальше порога или кандидатов нет — возвращает исходное значение. Порог ≤ 0 —
 * примагничивание выключено (возвращаем как есть). При равенстве расстояний
 * выбирается меньший кандидат (детерминизм на отсортированном наборе).
 */
export function snapValue(
  value: number,
  candidates: readonly number[],
  threshold: number,
): { value: number; snapped: boolean } {
  if (threshold <= 0) return { value, snapped: false };
  let best = value;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const dist = Math.abs(c - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  if (bestDist <= threshold) return { value: best, snapped: true };
  return { value, snapped: false };
}

/**
 * Притягивает точку к ближайшим кромкам по каждой оси независимо (X — к `xs`, Y — к
 * `ys`) в пределах порога. Возвращает новые координаты и флаги срабатывания snap по
 * осям. Порог ≤ 0 отключает примагничивание полностью.
 */
export function snapPoint(p: Point, edges: EdgeCandidates, threshold: number): SnapResult {
  const sx = snapValue(p.x, edges.xs, threshold);
  const sy = snapValue(p.y, edges.ys, threshold);
  return {
    point: { x: sx.value, y: sy.value },
    snappedX: sx.snapped,
    snappedY: sy.snapped,
  };
}

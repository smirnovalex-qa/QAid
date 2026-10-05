/**
 * Тесты чистого примагничивания концов свободной мерки к кромкам (TASK-033).
 * Без DOM: только числа и снимки `Rect`.
 */
import { describe, expect, it } from 'vitest';
import { collectEdges, snapPoint, snapValue } from '@/shared/inspection/ruler/snap';
import type { Rect } from '@/shared/inspection/ruler/types';

describe('collectEdges', () => {
  it('extracts left/right into xs and top/bottom into ys', () => {
    const rects: Rect[] = [{ x: 10, y: 20, width: 100, height: 40 }];
    expect(collectEdges(rects)).toEqual({ xs: [10, 110], ys: [20, 60] });
  });

  it('sorts and de-duplicates coincident edges of adjacent rects', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 }, // left edge (50) coincides with first right edge
    ];
    expect(collectEdges(rects)).toEqual({ xs: [0, 50, 100], ys: [0, 50] });
  });

  it('empty input → empty candidate sets', () => {
    expect(collectEdges([])).toEqual({ xs: [], ys: [] });
  });
});

describe('snapValue', () => {
  it('snaps to the nearest candidate within threshold', () => {
    expect(snapValue(48, [0, 50, 100], 4)).toEqual({ value: 50, snapped: true });
  });

  it('leaves the value untouched when the nearest is beyond threshold', () => {
    expect(snapValue(40, [0, 50, 100], 4)).toEqual({ value: 40, snapped: false });
  });

  it('threshold <= 0 disables snapping', () => {
    expect(snapValue(50, [50], 0)).toEqual({ value: 50, snapped: false });
    expect(snapValue(50, [50], -1)).toEqual({ value: 50, snapped: false });
  });

  it('no candidates → unchanged', () => {
    expect(snapValue(7, [], 10)).toEqual({ value: 7, snapped: false });
  });

  it('ties resolve to the smaller candidate (deterministic on sorted set)', () => {
    // value 5 is equidistant to 0 and 10; the first-seen (smaller) wins.
    expect(snapValue(5, [0, 10], 8)).toEqual({ value: 0, snapped: true });
  });

  it('exact threshold distance still snaps (inclusive)', () => {
    expect(snapValue(54, [50], 4)).toEqual({ value: 50, snapped: true });
  });
});

describe('snapPoint', () => {
  const rects: Rect[] = [{ x: 0, y: 0, width: 100, height: 60 }];
  const edges = collectEdges(rects);

  it('snaps both axes independently within threshold', () => {
    expect(snapPoint({ x: 2, y: 58 }, edges, 4)).toEqual({
      point: { x: 0, y: 60 },
      snappedX: true,
      snappedY: true,
    });
  });

  it('snaps one axis and leaves the other free', () => {
    const res = snapPoint({ x: 2, y: 30 }, edges, 4);
    expect(res.point).toEqual({ x: 0, y: 30 });
    expect(res.snappedX).toBe(true);
    expect(res.snappedY).toBe(false);
  });

  it('no snap when both axes are beyond threshold', () => {
    expect(snapPoint({ x: 40, y: 30 }, edges, 4)).toEqual({
      point: { x: 40, y: 30 },
      snappedX: false,
      snappedY: false,
    });
  });
});

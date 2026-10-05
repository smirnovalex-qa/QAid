import { describe, expect, it } from 'vitest';
import {
  centerDelta,
  edges,
  formatMeasurement,
  formatValue,
  formatVector,
  measureBetween,
  measureVector,
  overlap,
  pxToRem,
  roundHalf,
} from '@/shared/inspection/ruler/logic';
import type { Point, Rect } from '@/shared/inspection/ruler/types';

const A: Rect = { x: 0, y: 0, width: 100, height: 50 };

describe('roundHalf', () => {
  it('rounds to the nearest 0.5px', () => {
    expect(roundHalf(10)).toBe(10);
    expect(roundHalf(10.24)).toBe(10);
    expect(roundHalf(10.26)).toBe(10.5);
    expect(roundHalf(10.74)).toBe(10.5);
    expect(roundHalf(10.76)).toBe(11);
    expect(roundHalf(-3.3)).toBe(-3.5);
  });
});

describe('edges', () => {
  it('computes signed edge deltas (b − a)', () => {
    const b: Rect = { x: 10, y: 20, width: 100, height: 50 };
    expect(edges(A, b)).toEqual({ left: 10, right: 10, top: 20, bottom: 20 });
  });

  it('is zero for identical rects', () => {
    expect(edges(A, { ...A })).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
});

describe('overlap', () => {
  it('returns overlap lengths when projections intersect', () => {
    const b: Rect = { x: 50, y: 25, width: 100, height: 50 };
    // x: [0,100] ∩ [50,150] = 50; y: [0,50] ∩ [25,75] = 25
    expect(overlap(A, b)).toEqual({ x: 50, y: 25 });
  });

  it('returns 0 when projections do not intersect', () => {
    const b: Rect = { x: 200, y: 200, width: 10, height: 10 };
    expect(overlap(A, b)).toEqual({ x: 0, y: 0 });
  });
});

describe('centerDelta', () => {
  it('computes center offset (b − a)', () => {
    const b: Rect = { x: 100, y: 0, width: 100, height: 50 };
    // centerA = (50,25); centerB = (150,25)
    expect(centerDelta(A, b)).toEqual({ x: 100, y: 0 });
  });
});

describe('measureBetween', () => {
  it('measures a horizontal gap between side-by-side rects', () => {
    const b: Rect = { x: 150, y: 0, width: 100, height: 50 };
    const m = measureBetween(A, b);
    expect(m.gapX).toBe(50);
    expect(m.gapY).toBe(0);
    expect(m.overlapX).toBe(0);
    expect(m.overlapY).toBe(50);
    expect(m.edges).toEqual({ left: 150, right: 150, top: 0, bottom: 0 });
    expect(m.centerDelta).toEqual({ x: 150, y: 0 });
    expect(m.aligned.top).toBe(true);
    expect(m.aligned.bottom).toBe(true);
    expect(m.aligned.centerY).toBe(true);
    expect(m.aligned.left).toBe(false);
  });

  it('measures a vertical gap between stacked rects', () => {
    const b: Rect = { x: 0, y: 80, width: 100, height: 50 };
    const m = measureBetween(A, b);
    expect(m.gapY).toBe(30);
    expect(m.gapX).toBe(0);
    expect(m.overlapX).toBe(100);
    expect(m.aligned.left).toBe(true);
    expect(m.aligned.right).toBe(true);
    expect(m.aligned.centerX).toBe(true);
  });

  it('reports overlap and zero gap for intersecting rects', () => {
    const b: Rect = { x: 50, y: 25, width: 100, height: 50 };
    const m = measureBetween(A, b);
    expect(m.gapX).toBe(0);
    expect(m.gapY).toBe(0);
    expect(m.overlapX).toBe(50);
    expect(m.overlapY).toBe(25);
  });

  it('treats near-aligned edges (<0.5px) as aligned', () => {
    const b: Rect = { x: 0.4, y: 0, width: 100, height: 50 };
    const m = measureBetween(A, b);
    expect(m.aligned.left).toBe(true); // 0.4 < 0.5 tolerance
    expect(m.edges.left).toBe(0.5); // но округление до 0.5px в числовом поле
  });

  it('rounds sub-pixel measurements to 0.5px', () => {
    const b: Rect = { x: 150.24, y: 0, width: 100, height: 50 };
    const m = measureBetween(A, b);
    expect(m.gapX).toBe(50); // 50.24 → 50
    expect(m.edges.left).toBe(150); // 150.24 → 150
  });
});

describe('pxToRem', () => {
  it('divides by the root font size', () => {
    expect(pxToRem(16)).toBe(1);
    expect(pxToRem(24)).toBe(1.5);
    expect(pxToRem(8, 8)).toBe(1);
  });

  it('falls back to 16 for a non-positive root', () => {
    expect(pxToRem(32, 0)).toBe(2);
    expect(pxToRem(32, -5)).toBe(2);
  });
});

describe('formatValue', () => {
  it('formats px rounded to 0.5', () => {
    expect(formatValue(10.24, 'px')).toBe('10px');
    expect(formatValue(10.26, 'px')).toBe('10.5px');
  });

  it('formats rem to 3 decimals', () => {
    expect(formatValue(24, 'rem')).toBe('1.5rem');
    expect(formatValue(16, 'rem')).toBe('1rem');
  });
});

describe('formatMeasurement', () => {
  it('produces a multi-line report with aligned flags', () => {
    const b: Rect = { x: 150, y: 0, width: 100, height: 50 };
    const report = formatMeasurement(measureBetween(A, b), 'px');
    expect(report).toContain('gap: x=50px y=0px');
    expect(report).toContain('overlap: x=0px y=50px');
    expect(report).toContain('edges:');
    expect(report).toContain('aligned: top, bottom, centerY');
  });

  it('reports "none" when nothing is aligned', () => {
    const b: Rect = { x: 3, y: 7, width: 40, height: 20 };
    const report = formatMeasurement(measureBetween(A, b), 'px');
    expect(report).toContain('aligned: none');
  });

  it('honours rem units', () => {
    const b: Rect = { x: 150, y: 0, width: 100, height: 50 };
    const report = formatMeasurement(measureBetween(A, b), 'rem', 16);
    expect(report).toContain('gap: x=3.125rem');
  });
});

describe('measureVector (free-drag, TASK-033)', () => {
  const origin: Point = { x: 0, y: 0 };

  it('computes signed delta, abs size, length and angle for a 3-4-5 vector', () => {
    const m = measureVector(origin, { x: 30, y: 40 });
    expect(m).toEqual({ dx: 30, dy: 40, width: 30, height: 40, length: 50, angleDeg: 53.1 });
  });

  it('is signed for delta but absolute for size (B up-left of A)', () => {
    const m = measureVector({ x: 100, y: 100 }, { x: 60, y: 70 });
    expect(m.dx).toBe(-40);
    expect(m.dy).toBe(-30);
    expect(m.width).toBe(40);
    expect(m.height).toBe(30);
    expect(m.length).toBe(50);
  });

  it('angle: 0° pointing right, +90° pointing down (screen Y grows downward)', () => {
    expect(measureVector(origin, { x: 10, y: 0 }).angleDeg).toBe(0);
    expect(measureVector(origin, { x: 0, y: 10 }).angleDeg).toBe(90);
    expect(measureVector(origin, { x: 0, y: -10 }).angleDeg).toBe(-90);
    expect(measureVector(origin, { x: -10, y: 0 }).angleDeg).toBe(180);
  });

  it('rounds linear values to 0.5px and angle to 0.1°', () => {
    const m = measureVector(origin, { x: 1.26, y: 0 });
    expect(m.dx).toBe(1.5);
    expect(m.length).toBe(1.5);
    const diag = measureVector(origin, { x: 1, y: 3 });
    expect(diag.angleDeg).toBe(71.6);
  });

  it('zero-length vector: all zeros, angle 0', () => {
    expect(measureVector(origin, { x: 0, y: 0 })).toEqual({
      dx: 0,
      dy: 0,
      width: 0,
      height: 0,
      length: 0,
      angleDeg: 0,
    });
  });
});

describe('formatVector (TASK-033)', () => {
  it('formats length/delta/size in px and angle in degrees', () => {
    const report = formatVector(measureVector({ x: 0, y: 0 }, { x: 30, y: 40 }), 'px', 16);
    expect(report).toBe('length: 50px\ndelta: x=30px y=40px\nsize: 30px × 40px\nangle: 53.1°');
  });

  it('converts lengths to rem but leaves the angle in degrees', () => {
    const report = formatVector(measureVector({ x: 0, y: 0 }, { x: 32, y: 0 }), 'rem', 16);
    expect(report).toContain('length: 2rem');
    expect(report).toContain('angle: 0°');
  });
});

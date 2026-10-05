import { describe, expect, it } from 'vitest';
import {
  MAX_THICKNESS,
  MIN_THICKNESS,
  PALETTE,
  arrowHead,
  arrowHeadSize,
  buildRenderPlan,
  canRedo,
  canUndo,
  clampPixelRect,
  clampThickness,
  commit,
  createHistory,
  cropRectToPixels,
  isHexColor,
  makeAnnotationId,
  normalizeRect,
  pixelateRegion,
  planFullPageStitch,
  redo,
  redactionBlockSize,
  screenshotFileName,
  undo,
} from '@/features/screenshot/logic';
import type { Redaction } from '@/features/screenshot/logic';
import type { Annotation } from '@/features/screenshot/types';
import {
  all,
  arrow,
  blur,
  freehand,
  rectangle,
  rectangleReversed,
  text,
} from './fixtures/annotations';

describe('isHexColor', () => {
  it('accepts #rgb and #rrggbb', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#00aaFF')).toBe(true);
  });
  it('rejects malformed colours', () => {
    expect(isHexColor('fff')).toBe(false);
    expect(isHexColor('#gg0000')).toBe(false);
    expect(isHexColor('#1234')).toBe(false);
    expect(isHexColor('rgb(0,0,0)')).toBe(false);
  });
});

describe('clampThickness', () => {
  it('rounds and clamps into range', () => {
    expect(clampThickness(3.4)).toBe(3);
    expect(clampThickness(3.6)).toBe(4);
    expect(clampThickness(0)).toBe(MIN_THICKNESS);
    expect(clampThickness(1000)).toBe(MAX_THICKNESS);
  });
  it('falls back to min on non-finite', () => {
    expect(clampThickness(Number.NaN)).toBe(MIN_THICKNESS);
    expect(clampThickness(Number.POSITIVE_INFINITY)).toBe(MAX_THICKNESS);
  });
});

describe('makeAnnotationId', () => {
  it('is deterministic by sequence', () => {
    expect(makeAnnotationId(0)).toBe('a0');
    expect(makeAnnotationId(12)).toBe('a12');
    expect(makeAnnotationId(3.9)).toBe('a3');
  });
});

describe('PALETTE', () => {
  it('is all valid hex colours', () => {
    for (const c of PALETTE) expect(isHexColor(c)).toBe(true);
  });
});

describe('normalizeRect', () => {
  it('keeps positive rects intact', () => {
    expect(normalizeRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });
  it('flips negative width/height around the origin', () => {
    expect(normalizeRect({ x: 110, y: 60, width: -100, height: -40 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    });
  });
});

describe('cropRectToPixels', () => {
  it('scales by DPR and rounds to integers', () => {
    expect(cropRectToPixels({ x: 10, y: 20, width: 30, height: 40 }, 2)).toEqual({
      sx: 20,
      sy: 40,
      sw: 60,
      sh: 80,
    });
  });
  it('normalizes reversed rects before scaling', () => {
    expect(cropRectToPixels({ x: 40, y: 60, width: -30, height: -40 }, 1)).toEqual({
      sx: 10,
      sy: 20,
      sw: 30,
      sh: 40,
    });
  });
  it('treats non-positive DPR as 1 and clamps negatives to 0', () => {
    expect(cropRectToPixels({ x: -5, y: -5, width: 10, height: 10 }, 0)).toEqual({
      sx: 0,
      sy: 0,
      sw: 10,
      sh: 10,
    });
  });
});

describe('clampPixelRect', () => {
  it('clamps a crop within image bounds', () => {
    expect(clampPixelRect({ sx: 90, sy: 90, sw: 40, sh: 40 }, 100, 100)).toEqual({
      sx: 90,
      sy: 90,
      sw: 10,
      sh: 10,
    });
  });
  it('never returns negative width/height', () => {
    expect(clampPixelRect({ sx: 200, sy: 200, sw: 50, sh: 50 }, 100, 100)).toEqual({
      sx: 100,
      sy: 100,
      sw: 0,
      sh: 0,
    });
  });
});

describe('planFullPageStitch', () => {
  it('plans overlap-free steps with a partial final slice', () => {
    const plan = planFullPageStitch({
      docHeight: 2500,
      viewportHeight: 1000,
      viewportWidth: 1200,
      dpr: 1,
    });
    expect(plan.width).toBe(1200);
    expect(plan.height).toBe(2500);
    expect(plan.steps).toEqual([
      { scrollY: 0, destYDevice: 0, sourceYDevice: 0, sliceHeightDevice: 1000 },
      { scrollY: 1000, destYDevice: 1000, sourceYDevice: 0, sliceHeightDevice: 1000 },
      { scrollY: 1500, destYDevice: 2000, sourceYDevice: 500, sliceHeightDevice: 500 },
    ]);
  });

  it('applies DPR to device-space fields', () => {
    const plan = planFullPageStitch({
      docHeight: 1500,
      viewportHeight: 1000,
      viewportWidth: 800,
      dpr: 2,
    });
    expect(plan.width).toBe(1600);
    expect(plan.height).toBe(3000);
    expect(plan.steps).toEqual([
      { scrollY: 0, destYDevice: 0, sourceYDevice: 0, sliceHeightDevice: 2000 },
      { scrollY: 500, destYDevice: 2000, sourceYDevice: 1000, sliceHeightDevice: 1000 },
    ]);
  });

  it('produces a single step when the doc fits the viewport', () => {
    const plan = planFullPageStitch({
      docHeight: 600,
      viewportHeight: 1000,
      viewportWidth: 800,
      dpr: 1,
    });
    expect(plan.steps).toEqual([
      { scrollY: 0, destYDevice: 0, sourceYDevice: 0, sliceHeightDevice: 600 },
    ]);
    // Итоговая высота холста не меньше вьюпорта.
    expect(plan.height).toBe(1000);
  });

  it('guards a zero-height document and non-positive DPR', () => {
    const plan = planFullPageStitch({
      docHeight: 0,
      viewportHeight: 800,
      viewportWidth: 400,
      dpr: 0,
    });
    expect(plan.steps).toEqual([
      { scrollY: 0, destYDevice: 0, sourceYDevice: 0, sliceHeightDevice: 0 },
    ]);
    expect(plan.height).toBe(800);
  });
});

describe('arrowHead', () => {
  it('computes symmetric wings for a horizontal arrow', () => {
    const head = arrowHead(0, 0, 10, 0, 10);
    expect(head.tip).toEqual({ x: 10, y: 0 });
    expect(head.left.x).toBeCloseTo(0.99, 1);
    expect(head.left.y).toBeCloseTo(4.34, 1);
    expect(head.right.x).toBeCloseTo(0.99, 1);
    expect(head.right.y).toBeCloseTo(-4.34, 1);
  });
});

describe('arrowHeadSize', () => {
  it('has a floor for thin lines', () => {
    expect(arrowHeadSize(1)).toBe(12);
    expect(arrowHeadSize(10)).toBe(35);
  });
});

describe('buildRenderPlan', () => {
  it('splits redactions from overlays preserving order', () => {
    const plan = buildRenderPlan(all);
    // blur → redaction; остальные → overlays в порядке добавления.
    expect(plan.redactions).toHaveLength(1);
    expect(plan.overlays.map((o) => o.kind)).toEqual(['rectangle', 'arrow', 'freehand', 'text']);
  });

  it('normalizes reversed rectangles', () => {
    const plan = buildRenderPlan([rectangleReversed]);
    const op = plan.overlays[0];
    expect(op?.kind).toBe('rectangle');
    if (op?.kind === 'rectangle') {
      expect(op.rect).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    }
  });

  it('carries arrow head geometry', () => {
    const plan = buildRenderPlan([arrow]);
    const op = plan.overlays[0];
    expect(op?.kind).toBe('arrow');
    if (op?.kind === 'arrow') {
      expect(op.head.tip).toEqual({ x: 50, y: 0 });
    }
  });

  it('passes freehand points and text through', () => {
    const plan = buildRenderPlan([freehand, text]);
    const fh = plan.overlays[0];
    const tx = plan.overlays[1];
    if (fh?.kind === 'freehand') expect(fh.points).toHaveLength(3);
    if (tx?.kind === 'text') expect(tx.text).toBe('note');
  });

  it('rounds redaction rects', () => {
    const plan = buildRenderPlan([blur]);
    expect(plan.redactions[0]).toEqual({ x: 5, y: 5, width: 20, height: 20 });
  });
});

describe('pixelateRegion (destructive redaction)', () => {
  /** Строит RGBA-буфер W×H, заполненный ступенчатым градиентом по X. */
  function gradient(width: number, height: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = x * 10;
        data[i + 1] = x * 10;
        data[i + 2] = x * 10;
        data[i + 3] = 255;
      }
    }
    return data;
  }

  it('averages a 2×2 block to a single colour (irreversible)', () => {
    // 2×1 картинка: пиксели R=0 и R=10 → усреднение блоком 2 даёт 5 в обоих.
    const data = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    pixelateRegion(data, 2, 1, { x: 0, y: 0, width: 2, height: 1 }, 2);
    expect(data[0]).toBe(5);
    expect(data[4]).toBe(5);
    // Оба пикселя теперь равны — исходные значения не восстановимы.
    expect(data[0]).toBe(data[4]);
  });

  it('changes pixels inside the region and leaves the outside intact', () => {
    const w = 8;
    const h = 4;
    const data = gradient(w, h);
    const before = data.slice();
    const region: Redaction = { x: 2, y: 1, width: 4, height: 2 };
    pixelateRegion(data, w, h, region, 4);

    // Внутри — изменилось хотя бы одно значение.
    let changedInside = false;
    for (let y = 1; y < 3; y += 1) {
      for (let x = 2; x < 6; x += 1) {
        const i = (y * w + x) * 4;
        if (data[i] !== before[i]) changedInside = true;
      }
    }
    expect(changedInside).toBe(true);

    // Снаружи (строка 0) — без изменений.
    for (let x = 0; x < w; x += 1) {
      const i = x * 4;
      expect(data[i]).toBe(before[i]);
    }
  });

  it('clamps the region to image bounds and no-ops on degenerate size', () => {
    const data = gradient(4, 4);
    const before = data.slice();
    // Полностью вне изображения — ничего не меняем.
    pixelateRegion(data, 4, 4, { x: 10, y: 10, width: 5, height: 5 }, 4);
    expect(Array.from(data)).toEqual(Array.from(before));
    // Вырожденная зона — no-op.
    pixelateRegion(data, 4, 4, { x: 0, y: 0, width: 0, height: 0 }, 4);
    expect(Array.from(data)).toEqual(Array.from(before));
  });
});

describe('redactionBlockSize', () => {
  it('scales with the shorter side and has a floor', () => {
    expect(redactionBlockSize({ x: 0, y: 0, width: 10, height: 10 })).toBe(6);
    expect(redactionBlockSize({ x: 0, y: 0, width: 800, height: 400 })).toBe(50);
  });
});

describe('history (undo/redo)', () => {
  const a: Annotation[] = [];
  const b: Annotation[] = [rectangle];
  const c: Annotation[] = [rectangle, arrow];

  it('commits, undoes and redoes', () => {
    let h = createHistory<Annotation[]>(a);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);

    h = commit(h, b);
    h = commit(h, c);
    expect(h.present).toBe(c);
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present).toBe(b);
    expect(canRedo(h)).toBe(true);

    h = redo(h);
    expect(h.present).toBe(c);
  });

  it('commit clears the redo stack', () => {
    let h = createHistory<Annotation[]>(a);
    h = commit(h, b);
    h = undo(h);
    h = commit(h, c);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(c);
  });

  it('undo/redo are no-ops at the ends', () => {
    const h = createHistory<Annotation[]>(a);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});

describe('screenshotFileName', () => {
  it('formats a stable, zero-padded name', () => {
    const date = new Date(2026, 8, 5, 7, 3, 9); // 2026-09-05 07:03:09
    expect(screenshotFileName('full', date)).toBe('screenshot-full-20260905-070309.png');
  });
});

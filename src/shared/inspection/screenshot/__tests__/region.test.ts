/**
 * Юнит-тесты чистой геометрии in-page редактора (TASK-035): выделение, ресайз/сдвиг,
 * хит-тест ручек, клэмп тулбара во вьюпорт, перевод CSS→device и предикат
 * инжектируемости страницы. Без DOM — только числа/строки.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_REGION_SIZE,
  clampRectToViewport,
  handleAt,
  handlePoints,
  isInjectablePageUrl,
  isInside,
  isSignificantRegion,
  moveRect,
  normalizeRect,
  rectFromPoints,
  regionToDeviceCrop,
  resizeRect,
  toolbarPosition,
} from '../region';

const VP = { width: 1000, height: 800 };

describe('normalizeRect / rectFromPoints', () => {
  it('normalises negative sizes (drag from any corner)', () => {
    expect(normalizeRect({ x: 100, y: 100, width: -40, height: -20 })).toEqual({
      x: 60,
      y: 80,
      width: 40,
      height: 20,
    });
  });
  it('builds a normalised rect from two points', () => {
    expect(rectFromPoints({ x: 200, y: 150 }, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 100,
      height: 100,
    });
  });
});

describe('isSignificantRegion', () => {
  it('rejects tiny (accidental click) regions', () => {
    expect(isSignificantRegion({ x: 0, y: 0, width: MIN_REGION_SIZE - 1, height: 50 })).toBe(false);
  });
  it('accepts regions at/above the threshold', () => {
    expect(
      isSignificantRegion({ x: 0, y: 0, width: MIN_REGION_SIZE, height: MIN_REGION_SIZE }),
    ).toBe(true);
  });
});

describe('isInside', () => {
  const r = { x: 10, y: 10, width: 100, height: 100 };
  it('includes boundary, excludes outside', () => {
    expect(isInside(r, { x: 10, y: 10 })).toBe(true);
    expect(isInside(r, { x: 60, y: 60 })).toBe(true);
    expect(isInside(r, { x: 111, y: 60 })).toBe(false);
  });
});

describe('handlePoints / handleAt', () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };
  it('places 8 handles on the perimeter', () => {
    const pts = handlePoints(r);
    expect(pts.nw).toEqual({ x: 100, y: 100 });
    expect(pts.ne).toEqual({ x: 300, y: 100 });
    expect(pts.se).toEqual({ x: 300, y: 200 });
    expect(pts.sw).toEqual({ x: 100, y: 200 });
    expect(pts.n).toEqual({ x: 200, y: 100 });
    expect(pts.e).toEqual({ x: 300, y: 150 });
  });
  it('hit-tests the nearest resize handle within radius', () => {
    expect(handleAt(r, { x: 101, y: 101 }, 16)).toBe('nw');
    expect(handleAt(r, { x: 300, y: 200 }, 16)).toBe('se');
  });
  it('returns move for interior points, null for outside', () => {
    expect(handleAt(r, { x: 200, y: 150 }, 16)).toBe('move');
    expect(handleAt(r, { x: 5, y: 5 }, 16)).toBeNull();
  });
});

describe('resizeRect', () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };
  it('moves only the edges owned by the handle (se)', () => {
    expect(resizeRect(r, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 250, height: 120 });
  });
  it('moves the top-left for nw', () => {
    expect(resizeRect(r, 'nw', 10, 10)).toEqual({ x: 110, y: 110, width: 190, height: 90 });
  });
  it('constrains a single axis for edge handles (e)', () => {
    expect(resizeRect(r, 'e', 40, 999)).toEqual({ x: 100, y: 100, width: 240, height: 100 });
  });
  it('inverts correctly when dragged past the opposite edge', () => {
    const out = resizeRect(r, 'e', -260, 0); // right crosses left
    expect(out.width).toBeGreaterThanOrEqual(0);
    expect(out.x).toBeLessThanOrEqual(100);
  });
  it('translates the whole rect for move', () => {
    expect(resizeRect(r, 'move', 15, -5)).toEqual({ x: 115, y: 95, width: 200, height: 100 });
  });
});

describe('moveRect', () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };
  it('shifts within the viewport', () => {
    expect(moveRect(r, 50, 30, VP)).toEqual({ x: 150, y: 130, width: 200, height: 100 });
  });
  it('clamps to the viewport edges', () => {
    expect(moveRect(r, -999, -999, VP)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(moveRect(r, 999, 999, VP)).toEqual({ x: 800, y: 700, width: 200, height: 100 });
  });
});

describe('clampRectToViewport', () => {
  it('clips a rect overflowing the viewport', () => {
    expect(clampRectToViewport({ x: 900, y: 700, width: 400, height: 400 }, VP)).toEqual({
      x: 900,
      y: 700,
      width: 100,
      height: 100,
    });
  });
  it('clamps negative origin', () => {
    expect(clampRectToViewport({ x: -50, y: -20, width: 100, height: 100 }, VP)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });
});

describe('toolbarPosition', () => {
  const tb = { width: 320, height: 40 };
  it('places the toolbar below the selection when there is room', () => {
    const pos = toolbarPosition({ x: 100, y: 100, width: 200, height: 100 }, tb, VP, 8);
    expect(pos).toEqual({ x: 100, y: 208 });
  });
  it('places it above when there is no room below', () => {
    const pos = toolbarPosition({ x: 100, y: 600, width: 200, height: 180 }, tb, VP, 8);
    expect(pos.y).toBe(552); // 600 - 40 - 8
  });
  it('clamps x so the toolbar never leaves the viewport', () => {
    const pos = toolbarPosition({ x: 900, y: 100, width: 90, height: 100 }, tb, VP, 8);
    expect(pos.x).toBe(VP.width - tb.width - 8); // 672
  });
  it('keeps the toolbar on-screen for a full-viewport selection', () => {
    const pos = toolbarPosition({ x: 0, y: 0, width: 1000, height: 800 }, tb, VP, 8);
    expect(pos.y).toBeGreaterThanOrEqual(8);
    expect(pos.y + tb.height).toBeLessThanOrEqual(VP.height);
  });
});

describe('regionToDeviceCrop', () => {
  const frame = { width: 2000, height: 1600 };
  it('scales a CSS region to device px by DPR', () => {
    expect(regionToDeviceCrop({ x: 100, y: 50, width: 200, height: 100 }, 2, frame)).toEqual({
      sx: 200,
      sy: 100,
      sw: 400,
      sh: 200,
    });
  });
  it('clamps the crop inside the frame', () => {
    const crop = regionToDeviceCrop({ x: 950, y: 750, width: 200, height: 200 }, 2, frame);
    expect(crop.sx).toBe(1900);
    expect(crop.sw).toBe(100); // 2000 - 1900
    expect(crop.sy).toBe(1500);
    expect(crop.sh).toBe(100);
  });
  it('treats non-positive DPR as 1', () => {
    expect(regionToDeviceCrop({ x: 10, y: 10, width: 20, height: 20 }, 0, frame)).toEqual({
      sx: 10,
      sy: 10,
      sw: 20,
      sh: 20,
    });
  });
});

describe('isInjectablePageUrl', () => {
  it('accepts http/https pages', () => {
    expect(isInjectablePageUrl('https://example.com/path')).toBe(true);
    expect(isInjectablePageUrl('http://localhost:3000/')).toBe(true);
  });
  it('rejects privileged/blocked schemes', () => {
    expect(isInjectablePageUrl('chrome://settings')).toBe(false);
    expect(isInjectablePageUrl('edge://extensions')).toBe(false);
    expect(isInjectablePageUrl('view-source:https://example.com')).toBe(false);
    expect(isInjectablePageUrl('chrome-extension://abcdef/page.html')).toBe(false);
    expect(isInjectablePageUrl('file:///C:/tmp/x.html')).toBe(false);
    expect(isInjectablePageUrl('about:blank')).toBe(false);
  });
  it('rejects the Chrome Web Store', () => {
    expect(isInjectablePageUrl('https://chrome.google.com/webstore/detail/abc')).toBe(false);
    expect(isInjectablePageUrl('https://chromewebstore.google.com/detail/abc')).toBe(false);
  });
  it('rejects undefined/empty/garbage', () => {
    expect(isInjectablePageUrl(undefined)).toBe(false);
    expect(isInjectablePageUrl('')).toBe(false);
    expect(isInjectablePageUrl('not a url')).toBe(false);
  });
});

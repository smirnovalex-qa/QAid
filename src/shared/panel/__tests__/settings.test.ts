import { describe, expect, it } from 'vitest';
import { defineFeatureSettings } from '@/shared/storage/settings';
import { createMemoryArea } from '@/shared/storage/storage-area';
import { buildKey } from '@/shared/storage/keys';
import { CURRENT_SCHEMA_VERSION } from '@/shared/storage/schema';
import {
  FLOATING_PANEL_DEFAULTS,
  floatingPanelSchema,
  type FloatingPanelState,
} from '@/shared/panel/settings';

function definePanel(area = createMemoryArea()) {
  return defineFeatureSettings<FloatingPanelState>(
    { namespace: 'floating-panel', schema: floatingPanelSchema, defaults: FLOATING_PANEL_DEFAULTS },
    area,
  );
}

const key = buildKey(CURRENT_SCHEMA_VERSION, 'floating-panel', 'settings');

describe('floating-panel settings', () => {
  it('starts from unplaced defaults (x/y null, not collapsed)', async () => {
    const fp = definePanel();
    expect(await fp.get()).toEqual({ x: null, y: null, collapsed: false, width: 380 });
  });

  it('persists and restores a placed position', async () => {
    const fp = definePanel();
    await fp.set({ x: 120, y: 48, collapsed: true, width: 440 });
    expect(await fp.get()).toEqual({ x: 120, y: 48, collapsed: true, width: 440 });
  });

  it('update merges a partial patch (move keeps collapsed/width)', async () => {
    const fp = definePanel();
    await fp.set({ x: 10, y: 10, collapsed: false, width: 400 });
    await fp.update({ x: 999, y: 20 });
    expect(await fp.get()).toEqual({ x: 999, y: 20, collapsed: false, width: 400 });
  });

  it('clamps a corrupted out-of-range width back to the default (never throws)', async () => {
    const area = createMemoryArea({
      [key]: { x: 5, y: 5, collapsed: false, width: 99999 },
    });
    const fp = definePanel(area);
    expect((await fp.get()).width).toBe(380);
  });

  it('coerces a non-numeric x to null instead of discarding the whole blob', async () => {
    const area = createMemoryArea({
      [key]: { x: 'nope', y: 42, collapsed: true, width: 400 },
    });
    const fp = definePanel(area);
    expect(await fp.get()).toEqual({ x: null, y: 42, collapsed: true, width: 400 });
  });

  it('watch fires on its own namespace', async () => {
    const area = createMemoryArea();
    const fp = definePanel(area);
    const seen: FloatingPanelState[] = [];
    const off = fp.watch((v) => seen.push(v));
    await fp.set({ x: 1, y: 2, collapsed: false, width: 360 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ x: 1, y: 2, collapsed: false, width: 360 });
    off();
  });
});

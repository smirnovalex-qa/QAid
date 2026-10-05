import { describe, expect, it } from 'vitest';
import {
  allBackgroundHandlers,
  allFeatures,
  getFeatures,
  registerBackground,
  registerFeature,
} from '@/features/registry';
import type { BackgroundHandler, FeatureModule } from '@/features/registry';

const Noop = () => null;

function make(id: string, over: Partial<FeatureModule> = {}): FeatureModule {
  return { id, title: `t.${id}`, category: 'utils', load: () => Promise.resolve(Noop), ...over };
}

describe('feature registry', () => {
  it('registers and lists features', () => {
    registerFeature(make('reg-a'));
    expect(allFeatures().some((f) => f.id === 'reg-a')).toBe(true);
  });

  it('throws on duplicate id', () => {
    registerFeature(make('reg-dup'));
    expect(() => {
      registerFeature(make('reg-dup'));
    }).toThrow(/duplicate feature/);
  });

  it('filters by surface and sorts by order', () => {
    registerFeature(make('s-popup', { surface: 'popup', order: 2 }));
    registerFeature(make('s-both', { surface: 'both', order: 1 }));
    registerFeature(make('s-side', { surface: 'sidepanel', order: 0 }));

    const popup = getFeatures('popup').filter((f) => f.id.startsWith('s-'));
    expect(popup.map((f) => f.id)).toEqual(['s-both', 's-popup']);

    const side = getFeatures('sidepanel').filter((f) => f.id.startsWith('s-'));
    expect(side.map((f) => f.id)).toEqual(['s-side', 's-both']);
  });
});

describe('background contribution registry (F6 TASK-046)', () => {
  const handler = (type: string): BackgroundHandler => ({
    type,
    handler: () => Promise.resolve(null),
  });

  it('registers and flattens handlers across contributions', () => {
    registerBackground('bg-a', [handler('bg/a1'), handler('bg/a2')]);
    registerBackground('bg-b', [handler('bg/b1')]);
    const types = allBackgroundHandlers().map((h) => h.type);
    expect(types).toEqual(expect.arrayContaining(['bg/a1', 'bg/a2', 'bg/b1']));
  });

  it('throws on duplicate contribution id', () => {
    registerBackground('bg-dup', []);
    expect(() => {
      registerBackground('bg-dup', []);
    }).toThrow(/duplicate background/);
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineFeatureSettings } from '@/shared/storage/settings';
import { createMemoryArea } from '@/shared/storage/storage-area';
import { buildKey } from '@/shared/storage/keys';
import {
  CURRENT_SCHEMA_VERSION,
  currentSettingsSchema,
  settingsDefaults,
} from '@/shared/storage/schema';
import type { Settings } from '@/shared/storage/schema';
import { migrations as appMigrations } from '@/shared/storage/migrations';

// Простая feature-схема без __v (типичная фича).
const counterSchema = z.object({
  count: z.number().default(0),
  name: z.string().default(''),
});
type Counter = z.infer<typeof counterSchema>;
const counterDefaults: Counter = { count: 0, name: '' };

function defineCounter(namespace: string, area = createMemoryArea()) {
  return defineFeatureSettings<Counter>(
    { namespace, schema: counterSchema, defaults: counterDefaults },
    area,
  );
}

function defineApp(area = createMemoryArea()) {
  return defineFeatureSettings<Settings>(
    {
      namespace: 'app',
      schema: currentSettingsSchema,
      defaults: settingsDefaults,
      migrations: appMigrations,
    },
    area,
  );
}

describe('defineFeatureSettings', () => {
  it('round-trips set → get preserving types/values', async () => {
    const fs = defineCounter('rn');
    await fs.set({ count: 7, name: 'seven' });
    expect(await fs.get()).toEqual({ count: 7, name: 'seven' });
  });

  it('update merges a partial patch', async () => {
    const fs = defineCounter('rn');
    await fs.set({ count: 1, name: 'a' });
    await fs.update({ count: 2 });
    expect(await fs.get()).toEqual({ count: 2, name: 'a' });
  });

  it('reset restores defaults', async () => {
    const fs = defineCounter('rn');
    await fs.set({ count: 9, name: 'x' });
    await fs.reset();
    expect(await fs.get()).toEqual(counterDefaults);
  });

  it('returns defaults for corrupted storage and never throws', async () => {
    const area = createMemoryArea({
      [buildKey(CURRENT_SCHEMA_VERSION, 'rn', 'settings')]: { count: 'not-a-number' },
    });
    const fs = defineCounter('rn', area);
    await expect(fs.get()).resolves.toEqual(counterDefaults);
  });

  it('keeps two namespaces isolated on a shared area', async () => {
    const area = createMemoryArea();
    const a = defineCounter('a', area);
    const b = defineCounter('b', area);
    await a.set({ count: 5, name: 'a' });
    expect(await b.get()).toEqual(counterDefaults);
    expect(await a.get()).toEqual({ count: 5, name: 'a' });
  });

  it('watch fires for its own namespace and not for foreign keys', async () => {
    const area = createMemoryArea();
    const fs = defineCounter('rn', area);
    const seen: Counter[] = [];
    const off = fs.watch((v) => seen.push(v));

    await fs.set({ count: 3, name: 'z' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ count: 3, name: 'z' });

    // Чужой ключ — watch не должен срабатывать.
    await area.setRaw(buildKey(CURRENT_SCHEMA_VERSION, 'other', 'settings'), {
      count: 1,
      name: '',
    });
    expect(seen).toHaveLength(1);

    off();
    await fs.set({ count: 4, name: 'z' });
    expect(seen).toHaveLength(1); // после отписки не растёт
  });

  it('migrates a v1 blob to v2 on get (content-based)', async () => {
    const area = createMemoryArea({
      [buildKey(CURRENT_SCHEMA_VERSION, 'app', 'settings')]: {
        __v: 1,
        theme: 'dark',
        locale: 'en',
        features: { anything: 1 },
      },
    });
    const app = defineApp(area);
    expect(await app.get()).toEqual({
      __v: 2,
      theme: 'dark',
      locale: 'en',
      copy: { defaultFormat: 'plain' },
    });
  });

  it('migrates data stored under a previous schema-version key', async () => {
    const area = createMemoryArea({
      [buildKey(1, 'app', 'settings')]: { __v: 1, theme: 'light', locale: 'ru', features: {} },
    });
    const app = defineApp(area);
    expect(await app.get()).toMatchObject({
      __v: 2,
      theme: 'light',
      copy: { defaultFormat: 'plain' },
    });
  });

  it('does not auto-overwrite storage on downgrade (__v > CURRENT)', async () => {
    const key = buildKey(CURRENT_SCHEMA_VERSION, 'app', 'settings');
    const future = {
      __v: 99,
      theme: 'dark',
      locale: 'en',
      copy: { defaultFormat: 'json' },
      extra: true,
    };
    const area = createMemoryArea({ [key]: future });
    const app = defineApp(area);

    expect(await app.get()).toEqual(settingsDefaults); // чтение — на дефолтах
    expect(await area.getRaw(key)).toEqual(future); // хранилище НЕ перезаписано
  });
});

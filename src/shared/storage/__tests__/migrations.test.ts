import { describe, it, expect } from 'vitest';

import { migrations, runMigrations } from '../migrations';
import { settingsDefaults, CURRENT_SCHEMA_VERSION } from '../schema/index';

describe('migrateV1ToV2', () => {
  const v1ToV2 = migrations.find((m) => m.from === 1 && m.to === 2)!;

  it('переносит theme/locale, добавляет copy.defaultFormat, отбрасывает features', () => {
    const result = v1ToV2.migrate({
      __v: 1,
      theme: 'dark',
      locale: 'en',
      features: { foo: true, bar: 42 },
    });

    expect(result).toEqual({
      __v: 2,
      theme: 'dark',
      locale: 'en',
      copy: { defaultFormat: 'plain' },
    });
    expect(result).not.toHaveProperty('features');
  });

  it('использует дефолты theme/locale при их отсутствии', () => {
    const result = v1ToV2.migrate({ __v: 1 });
    expect(result).toEqual({
      __v: 2,
      theme: 'system',
      locale: 'ru',
      copy: { defaultFormat: 'plain' },
    });
  });
});

describe('runMigrations', () => {
  it('мигрирует v1 → v2, сохраняя theme/locale и добавляя copy', () => {
    const raw = { __v: 1, theme: 'light', locale: 'en', features: { x: 1 } };
    const result = runMigrations(raw, CURRENT_SCHEMA_VERSION, settingsDefaults);
    expect(result).toEqual({
      __v: 2,
      theme: 'light',
      locale: 'en',
      copy: { defaultFormat: 'plain' },
    });
  });

  it('мигрирует v1 с отсутствующими theme/locale через fallback-дефолты', () => {
    const raw = { __v: 1, features: {} };
    const result = runMigrations(raw, CURRENT_SCHEMA_VERSION, settingsDefaults);
    expect(result).toEqual({
      __v: 2,
      theme: 'system',
      locale: 'ru',
      copy: { defaultFormat: 'plain' },
    });
  });

  it('идемпотентен: уже-v2 объект возвращается без изменений', () => {
    const raw = { __v: 2, theme: 'dark', locale: 'ru', copy: { defaultFormat: 'json' } };
    const result = runMigrations(raw, CURRENT_SCHEMA_VERSION, settingsDefaults);
    expect(result).toBe(raw);
  });

  it('отсутствие __v (pre-v1) → дефолты', () => {
    const result = runMigrations({ theme: 'dark' }, CURRENT_SCHEMA_VERSION, settingsDefaults);
    expect(result).toBe(settingsDefaults);
  });

  it('не-объект → дефолты', () => {
    expect(runMigrations(null, CURRENT_SCHEMA_VERSION, settingsDefaults)).toBe(settingsDefaults);
    expect(runMigrations('nope', CURRENT_SCHEMA_VERSION, settingsDefaults)).toBe(settingsDefaults);
    expect(runMigrations(7, CURRENT_SCHEMA_VERSION, settingsDefaults)).toBe(settingsDefaults);
  });

  it('нечисловой __v → дефолты', () => {
    const result = runMigrations({ __v: 'x' }, CURRENT_SCHEMA_VERSION, settingsDefaults);
    expect(result).toBe(settingsDefaults);
  });

  it('новее целевой (99 > 2) → дефолты, чужой объект не возвращается', () => {
    const foreign = { __v: 99, alien: true };
    const result = runMigrations(foreign, CURRENT_SCHEMA_VERSION, settingsDefaults);
    expect(result).toBe(settingsDefaults);
    expect(result).not.toBe(foreign);
  });

  it('отсутствует нужный шаг миграции → дефолты', () => {
    // targetVersion 5, но миграции с from=2 нет.
    const raw = { __v: 2, theme: 'dark', locale: 'ru', copy: { defaultFormat: 'plain' } };
    const result = runMigrations(raw, 5, settingsDefaults);
    expect(result).toBe(settingsDefaults);
  });
});

/**
 * Типизированный слой настроек с namespacing по фичам.
 *
 * Прямое обращение к `chrome.storage.local` из фич запрещено — только через этот
 * API. Значения читаются через zod с fallback на дефолты (устойчивость к
 * повреждённому/старому хранилищу), при апгрейде версии схемы применяются
 * миграции, а `get()` никогда не перезаписывает хранилище (безопасность при
 * даунгрейде расширения).
 *
 * Namespace фичи по конвенции совпадает с именем директории `src/features/<f>/`.
 */
import { CURRENT_SCHEMA_VERSION, currentSettingsSchema, settingsDefaults } from './schema';
import type { Settings } from './schema';
import { migrations as appMigrations, runMigrationsWith } from './migrations';
import type { Migration } from './migrations';
import { buildKey } from './keys';
import { decode, encode } from './codec';
import type { Schema } from './codec';
import { createChromeLocalArea } from './storage-area';
import type { StorageArea } from './storage-area';

/** Ключ-подпуть, под которым лежит блоб настроек namespace'а. */
const SETTINGS_KEY = 'settings';

export interface FeatureSettingsConfig<T> {
  readonly namespace: string;
  readonly schema: Schema<T>;
  readonly defaults: T;
  readonly migrations?: readonly Migration[];
}

export interface FeatureSettings<T> {
  /** Дефолты namespace'а (для реактивного биндинга до первого get). */
  readonly defaults: T;
  get(): Promise<T>;
  set(value: T): Promise<void>;
  update(patch: Partial<T>): Promise<void>;
  reset(): Promise<void>;
  watch(cb: (value: T) => void): () => void;
}

// Единый chrome-local area на весь пакет (ленивая инициализация; в тестах
// передаётся createMemoryArea).
let sharedArea: StorageArea | undefined;
function defaultArea(): StorageArea {
  sharedArea ??= createChromeLocalArea();
  return sharedArea;
}

export function defineFeatureSettings<T>(
  cfg: FeatureSettingsConfig<T>,
  area: StorageArea = defaultArea(),
): FeatureSettings<T> {
  const key = buildKey(CURRENT_SCHEMA_VERSION, cfg.namespace, SETTINGS_KEY);
  const migrationList = cfg.migrations;
  const hasMigrations = migrationList !== undefined && migrationList.length > 0;

  /** Приводит сырое значение к валидному T: миграции (если есть) → zod → fallback. */
  const coerce = (raw: unknown): T => {
    const source = hasMigrations
      ? runMigrationsWith(migrationList, raw, CURRENT_SCHEMA_VERSION, cfg.defaults)
      : (raw ?? cfg.defaults);
    const res = decode(source, cfg.schema);
    return res.ok ? res.value : cfg.defaults;
  };

  const readRaw = async (): Promise<unknown> => {
    const raw = await area.getRaw(key);
    if (raw !== undefined || !hasMigrations) return raw;
    // Данные могли остаться под ключом предыдущей версии схемы (апгрейд
    // расширения) — поднимаем самую свежую найденную версию для миграции.
    for (let v = CURRENT_SCHEMA_VERSION - 1; v >= 1; v -= 1) {
      const prev = await area.getRaw(buildKey(v, cfg.namespace, SETTINGS_KEY));
      if (prev !== undefined) return prev;
    }
    return undefined;
  };

  const get = async (): Promise<T> => coerce(await readRaw());

  const set = async (value: T): Promise<void> => {
    // encode валидирует ПЕРЕД записью (инвариант кода); хранилище держит
    // структурированное значение, без двойного JSON.
    await area.setRaw(key, encode(value, cfg.schema));
  };

  const update = async (patch: Partial<T>): Promise<void> => {
    // read-modify-write в одной микротаске (last-write-wins между вкладками).
    const current = await get();
    await set({ ...current, ...patch });
  };

  const reset = async (): Promise<void> => {
    await set(cfg.defaults);
  };

  const watch = (cb: (value: T) => void): (() => void) =>
    area.onChanged((changes) => {
      if (!(key in changes)) return; // не наш namespace — игнорируем
      cb(coerce(changes[key]?.newValue));
    });

  return { defaults: cfg.defaults, get, set, update, reset, watch };
}

/** Глобальные настройки приложения (тема/локаль/копирование), версия схемы = CURRENT. */
export const appSettings: FeatureSettings<Settings> = defineFeatureSettings<Settings>({
  namespace: 'app',
  schema: currentSettingsSchema,
  defaults: settingsDefaults,
  migrations: appMigrations,
});

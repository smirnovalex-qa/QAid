/**
 * Миграции настроек между версиями схемы.
 *
 * Каждая миграция — чистая функция без async и без обращений к chrome.
 */

/** Один шаг миграции: `from` → `to`. */
export interface Migration {
  readonly from: number;
  readonly to: number;
  migrate(prev: unknown): unknown; // чистая функция, без async и chrome
}

/** Возвращает `record[key]`, если это объект, иначе `undefined`. */
function readProp(value: unknown, key: string): unknown {
  if (typeof value === 'object' && value !== null && key in value) {
    return (value as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Миграция v1 → v2: переносит theme/locale, добавляет copy.defaultFormat,
 * отбрасывает произвольный bag features.
 *
 * @param prev Настройки в форме v1 (или частичные).
 * @returns Настройки в форме v2.
 */
function migrateV1ToV2(prev: unknown): unknown {
  const theme = readProp(prev, 'theme');
  const locale = readProp(prev, 'locale');
  return {
    __v: 2,
    theme: theme ?? 'system',
    locale: locale ?? 'ru',
    copy: { defaultFormat: 'plain' },
  };
}

/** Список миграций, упорядоченный по возрастанию версии. */
export const migrations: readonly Migration[] = [{ from: 1, to: 2, migrate: migrateV1ToV2 }];

/** Извлекает числовой `__v` из объекта, иначе `null` (pre-v1). */
function detectVersion(raw: unknown): number | null {
  const v = readProp(raw, '__v');
  return typeof v === 'number' ? v : null;
}

/**
 * Прогоняет цепочку миграций из произвольного реестра `list` от версии
 * `raw.__v` до `targetVersion`. Обобщение поверх любого набора миграций
 * (app-настройки или per-feature) — чтобы слой настроек переиспользовал одну
 * реализацию, а не дублировал логику.
 *
 * @param list Реестр миграций (упорядоченность не требуется — шаг ищется по `from`).
 * @param raw Сырые данные из хранилища.
 * @param targetVersion Целевая версия схемы.
 * @param defaults Дефолты, возвращаемые при любой неоднозначности.
 * @returns Мигрированные данные либо `defaults`.
 */
export function runMigrationsWith(
  list: readonly Migration[],
  raw: unknown,
  targetVersion: number,
  defaults: unknown,
): unknown {
  const current = detectVersion(raw);

  // Версию не определить (не объект или нет числового __v) → дефолты.
  if (current === null) {
    return defaults;
  }
  // Даунгрейд расширения: не трогаем чужие данные новее нашей схемы.
  if (current > targetVersion) {
    return defaults;
  }
  // Уже на целевой версии — идемпотентный no-op.
  if (current === targetVersion) {
    return raw;
  }

  let version = current;
  let data = raw;
  while (version < targetVersion) {
    const step = list.find((m) => m.from === version);
    if (step === undefined) {
      return defaults;
    }
    try {
      data = step.migrate(data);
    } catch {
      return defaults;
    }
    version = step.to;
  }
  return data;
}

/**
 * Прогоняет цепочку app-миграций (реестр `migrations`) от версии `raw.__v`
 * до `targetVersion`.
 *
 * @param raw Сырые данные из хранилища.
 * @param targetVersion Целевая версия схемы.
 * @param defaults Дефолты, возвращаемые при любой неоднозначности.
 * @returns Мигрированные данные либо `defaults`.
 */
export function runMigrations(raw: unknown, targetVersion: number, defaults: unknown): unknown {
  return runMigrationsWith(migrations, raw, targetVersion, defaults);
}

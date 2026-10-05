/**
 * Проводка синглтон-движка синка (TASK-029). Импуртная точка: связывает движок
 * (`engine.ts`) с платформенным seam `storage.sync` и конкретным `NamespaceStore`.
 *
 * Синк идёт через платформенный seam `storageSync` (`chrome.storage.sync`), форма —
 * `ports.ts::StorageSyncSeam`. Движок грациозно деградирует, если вызовы seam'а
 * бросают (окружение без `sync`): `isAvailable()`/операции ловят ошибку, UI
 * показывает «синк недоступен», ничего не падает.
 *
 * Сейчас реально связано только пространство `app` (тема/язык/копирование) через
 * публичный `appSettings` из `@/shared/storage`. Биндеры пресетов генераторов
 * (`random-numbers`/`random-strings`/`forms`) — добор: их id уже в
 * `SYNCABLE_NAMESPACE_CATALOG`, но без биндера строки в UI не показываются
 * (`createNamespaceStore` фильтрует), поэтому связано ровно то, что работает.
 */
import { storageSync } from '@/platform';
import { appSettings } from '@/shared/storage';
import { createSettingsSync } from './engine';
import type { SettingsSyncEngine } from './engine';
import { createNamespaceStore, SYNCABLE_NAMESPACE_CATALOG } from './store';
import type { StorageSyncSeam } from './ports';

// `undefined`, если платформа не отдала seam (`chrome.storage.sync` недоступен) →
// движок сообщает `unavailable`, UI показывает нотис, локальный слой не страдает.
const sync: StorageSyncSeam | undefined = storageSync;

const store = createNamespaceStore(SYNCABLE_NAMESPACE_CATALOG, {
  app: {
    read: (): Promise<unknown> => appSettings.get(),
    write: (value: unknown): Promise<void> =>
      appSettings.set(value as Parameters<typeof appSettings.set>[0]),
  },
});

/** Синглтон-движок синка для UI-поверхности. */
export const settingsSyncEngine: SettingsSyncEngine = createSettingsSync({ store, sync });

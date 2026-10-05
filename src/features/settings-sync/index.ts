/**
 * Дескриптор фичи «Синк настроек и пресетов между устройствами» (TASK-029) +
 * саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings` и `./instance`) создаёт singleton-биндинг
 * настроек и синглтон-движок синка; фрагменты i18n домешиваются через `mergeCatalog`.
 * Категория — `utils`. Собственного бэкенда/сети нет: синк идёт только через
 * платформенный seam `storage.sync` (его добавляет оркестратор в `@/platform`).
 *
 * Проводка, которую финализирует оркестратор, — в `./instance` (биндеры пресетов
 * генераторов) и в `@/platform` (seam `storageSync`); см. отчёт по TASK-029.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'settings-sync',
  title: 'feature.settingsSync.title',
  category: 'utils',
  surface: 'both',
  order: 200,
  icon: glyphIcon('⇄'),
  load: () => import('./ui').then((m) => m.SettingsSyncPanel),
});

// Публичный API для проводки оркестратором (тесты используют напрямую).
export { createSettingsSync } from './engine';
export type { SettingsSyncEngine, SettingsSyncDeps } from './engine';
export {
  createNamespaceStore,
  SYNCABLE_NAMESPACE_CATALOG,
  DEFAULT_EXCLUDED_NAMESPACES,
} from './store';
export type { RawNamespaceBinder } from './store';
export type { NamespaceStore, StorageSyncSeam, SyncableNamespace } from './ports';

/**
 * Публичный API слоя настроек и хранилища (TASK-005).
 *
 * Фичи используют ТОЛЬКО этот пакет; низкоуровневые area-обёртки
 * (`createChromeLocalArea`/`createMemoryArea`) — internal и наружу не
 * экспортируются.
 */
export { defineFeatureSettings, appSettings } from './settings';
export type { FeatureSettings, FeatureSettingsConfig } from './settings';

export { createSettingsBinding, useSettings } from './preact/useSettings';
export type { SettingsBinding } from './preact/useSettings';

export { CURRENT_SCHEMA_VERSION } from './schema';
export type { Settings } from './schema';

export type { Migration } from './migrations';

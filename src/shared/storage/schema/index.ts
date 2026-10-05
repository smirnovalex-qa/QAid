/**
 * Актуальная схема настроек и её версия.
 */

import { settingsV1 } from './v1';
import type { SettingsV1 } from './v1';
import { settingsV2 } from './v2';
import type { SettingsV2 } from './v2';

/** Текущая версия схемы настроек. */
export const CURRENT_SCHEMA_VERSION = 2 as const;

/** Актуальная схема настроек. */
export const currentSettingsSchema = settingsV2;

/** Актуальный тип настроек. */
export type Settings = SettingsV2;

/** Полные дефолты приложения — схема с проставленными default-значениями. */
export const settingsDefaults: Settings = settingsV2.parse({ __v: 2 });

export { settingsV1, settingsV2 };
export type { SettingsV1, SettingsV2 };

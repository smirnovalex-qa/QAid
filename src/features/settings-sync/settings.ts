import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { SETTINGS_SYNC_DEFAULTS } from './types';
import type { NamespaceSyncMeta, SettingsSyncState } from './types';

const metaSchema: z.ZodType<NamespaceSyncMeta, z.ZodTypeDef, unknown> = z.object({
  selected: z.boolean(),
  baseUpdatedAt: z.number(),
  baseSig: z.string(),
  conflict: z.boolean(),
});

// Схема персистентного состояния фичи «Синк настроек». Хранится ЛОКАЛЬно
// (TASK-005), а не в sync: это метаданные синка (выбор/база/конфликт), не сам
// синкаемый контент.
const schema: z.ZodType<SettingsSyncState, z.ZodTypeDef, unknown> = z.object({
  enabled: z.boolean(),
  ack: z.boolean(),
  lastSyncAt: z.number(),
  namespaces: z.record(z.string(), metaSchema),
});

export const settingsSyncSettings = defineFeatureSettings<SettingsSyncState>({
  namespace: 'settings-sync',
  schema,
  defaults: SETTINGS_SYNC_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const settingsSyncBinding = createSettingsBinding(settingsSyncSettings);

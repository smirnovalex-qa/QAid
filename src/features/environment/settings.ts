import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { EnvironmentConfigSchema } from './messages';
import { ENVIRONMENT_SETTINGS_DEFAULTS } from './types';
import type { EnvironmentSettingsState } from './types';

/** Флаг query-профиля: имя/значение + тумблер активности. */
const QueryFlagSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
});

// Персистентное состояние фичи: тумблер эмуляции + последний конфиг + флаги
// (namespace `environment`). Схема переиспользует `EnvironmentConfigSchema` из
// контракта сообщений — единый источник формы конфига.
const schema: z.ZodType<EnvironmentSettingsState, z.ZodTypeDef, unknown> = z.object({
  enabled: z.boolean(),
  config: EnvironmentConfigSchema,
  flags: z.array(QueryFlagSchema),
});

export const environmentSettings = defineFeatureSettings<EnvironmentSettingsState>({
  namespace: 'environment',
  schema,
  defaults: ENVIRONMENT_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const environmentBinding = createSettingsBinding(environmentSettings);

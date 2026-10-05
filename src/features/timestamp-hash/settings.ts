/**
 * Слой настроек фичи «Таймстемпы и хеши» (TASK-005): персист активной под-вкладки
 * и пользовательских предпочтений (единица unix, алгоритм, кодировка, зона).
 */
import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { TS_HASH_DEFAULTS } from './types';
import type { TsHashState } from './types';

// Схема персистимого состояния фичи.
const schema: z.ZodType<TsHashState, z.ZodTypeDef, unknown> = z.object({
  activeTab: z.enum(['timestamp', 'hash']),
  unit: z.enum(['seconds', 'milliseconds']),
  algo: z.enum(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'MD5']),
  encoding: z.enum(['hex', 'base64']),
  zone: z.string(),
});

export const tsHashSettings = defineFeatureSettings<TsHashState>({
  namespace: 'timestamp-hash',
  schema,
  defaults: TS_HASH_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const tsHashBinding = createSettingsBinding(tsHashSettings);

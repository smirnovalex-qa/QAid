/**
 * Схема настроек версии 1.
 */

import { z } from 'zod';

/** Настройки приложения, схема v1. */
export const settingsV1 = z.object({
  __v: z.literal(1),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  locale: z.enum(['ru', 'en']).default('ru'),
  features: z.record(z.string(), z.unknown()).default({}),
});

/** Тип настроек v1. */
export type SettingsV1 = z.infer<typeof settingsV1>;

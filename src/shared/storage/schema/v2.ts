/**
 * Схема настроек версии 2.
 */

import { z } from 'zod';

/** Настройки приложения, схема v2. */
export const settingsV2 = z.object({
  __v: z.literal(2),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  locale: z.enum(['ru', 'en']).default('ru'),
  copy: z
    .object({ defaultFormat: z.enum(['plain', 'json', 'csv']).default('plain') })
    .default({ defaultFormat: 'plain' }),
});

/** Тип настроек v2. */
export type SettingsV2 = z.infer<typeof settingsV2>;

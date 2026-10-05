import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { CONTRAST_SETTINGS_DEFAULTS } from '@/shared/inspection/contrast/types';
import type { ContrastSettingsState } from '@/shared/inspection/contrast/types';

// Схема персистентного состояния фичи «Контраст WCAG» (уровень/тип текста/только фейлы).
const schema: z.ZodType<ContrastSettingsState, z.ZodTypeDef, unknown> = z.object({
  level: z.enum(['AA', 'AAA']),
  textType: z.enum(['all', 'normal', 'large']),
  onlyFails: z.boolean(),
});

export const contrastSettings = defineFeatureSettings<ContrastSettingsState>({
  namespace: 'inspector-contrast',
  schema,
  defaults: CONTRAST_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const contrastBinding = createSettingsBinding(contrastSettings);

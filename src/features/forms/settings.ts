import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { FORMS_SETTINGS_DEFAULTS } from '@/shared/inspection/forms/types';
import type { FormsSettingsState } from '@/shared/inspection/forms/types';

// Схема персистентного состояния фичи «Формы» (выбранный профиль автозаполнения).
const schema: z.ZodType<FormsSettingsState, z.ZodTypeDef, unknown> = z.object({
  profile: z.enum(['valid', 'boundary', 'empty', 'injection']),
});

export const formsSettings = defineFeatureSettings<FormsSettingsState>({
  namespace: 'forms',
  schema,
  defaults: FORMS_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const formsBinding = createSettingsBinding(formsSettings);

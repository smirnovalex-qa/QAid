import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { DEFECT_SETTINGS_DEFAULTS } from '@/shared/inspection/defects/types';
import type { DefectSettingsState } from '@/shared/inspection/defects/types';

// Схема персистентного состояния фичи «Детектор дефектов»: список выключенных правил.
const schema: z.ZodType<DefectSettingsState, z.ZodTypeDef, unknown> = z.object({
  disabledRules: z.array(z.string()),
});

export const defectSettings = defineFeatureSettings<DefectSettingsState>({
  namespace: 'defect-detector',
  schema,
  defaults: DEFECT_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const defectBinding = createSettingsBinding(defectSettings);

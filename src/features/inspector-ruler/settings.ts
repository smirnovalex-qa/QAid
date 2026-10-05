import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { RULER_SETTINGS_DEFAULTS } from '@/shared/inspection/ruler/types';
import type { RulerSettingsState } from '@/shared/inspection/ruler/types';

// Схема персистентного состояния фичи «Линейка» (режим/единицы/snap-настройки).
// `.default()` на новых полях — обратная совместимость: состояние, сохранённое до
// TASK-033 (без `snapEnabled`/со старым набором `mode`), парсится без сброса.
const schema: z.ZodType<RulerSettingsState, z.ZodTypeDef, unknown> = z.object({
  mode: z.enum(['ab', 'box', 'free']),
  units: z.enum(['px', 'rem']),
  snap: z.number().int().min(0).max(64),
  snapEnabled: z.boolean().default(true),
});

export const rulerSettings = defineFeatureSettings<RulerSettingsState>({
  namespace: 'inspector-ruler',
  schema,
  defaults: RULER_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const rulerBinding = createSettingsBinding(rulerSettings);

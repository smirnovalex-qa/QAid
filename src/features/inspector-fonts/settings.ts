import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { FONTS_DEFAULTS } from '@/shared/inspection/fonts/types';
import type { FontsState } from '@/shared/inspection/fonts/types';

// Схема персистентного состояния инспектора шрифтов (порядок сортировки списка).
const schema: z.ZodType<FontsState, z.ZodTypeDef, unknown> = z.object({
  sort: z.enum(['count', 'name']),
});

export const fontsSettings = defineFeatureSettings<FontsState>({
  namespace: 'inspector-fonts',
  schema,
  defaults: FONTS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const fontsBinding = createSettingsBinding(fontsSettings);

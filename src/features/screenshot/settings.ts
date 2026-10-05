import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { SCREENSHOT_SETTINGS_DEFAULTS } from './types';
import type { ScreenshotSettingsState } from './types';

// Схема персистентного состояния: режим захвата + последний цвет/толщина/инструмент.
const schema: z.ZodType<ScreenshotSettingsState, z.ZodTypeDef, unknown> = z.object({
  mode: z.enum(['visible', 'element', 'full']),
  color: z.string(),
  thickness: z.number(),
  tool: z.enum(['rectangle', 'arrow', 'freehand', 'text', 'blur']),
});

export const screenshotSettings = defineFeatureSettings<ScreenshotSettingsState>({
  // Namespace совпадает с именем директории фичи (конвенция слоя настроек).
  namespace: 'screenshot',
  schema,
  defaults: SCREENSHOT_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const screenshotBinding = createSettingsBinding(screenshotSettings);

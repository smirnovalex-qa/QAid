import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { DECODERS_DEFAULTS } from './types';
import type { DecodersState } from './types';

// Схема персистентного состояния фичи «Декодеры» (активная под-вкладка).
const schema: z.ZodType<DecodersState, z.ZodTypeDef, unknown> = z.object({
  activeTab: z.enum(['jwt', 'base64', 'url', 'json']),
});

export const decodersSettings = defineFeatureSettings<DecodersState>({
  namespace: 'decoders',
  schema,
  defaults: DECODERS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const decodersBinding = createSettingsBinding(decodersSettings);

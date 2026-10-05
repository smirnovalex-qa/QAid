import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { MAX_COUNT, MAX_PRECISION, RANDOM_NUMBERS_DEFAULTS } from './types';
import type { RandomNumbersParams } from './types';

// Схема параметров фичи «Случайные числа».
const schema: z.ZodType<RandomNumbersParams, z.ZodTypeDef, unknown> = z.object({
  mode: z.enum(['integer', 'float']),
  min: z.number(),
  max: z.number(),
  precision: z.number().int().min(0).max(MAX_PRECISION),
  count: z.number().int().min(1).max(MAX_COUNT),
  separator: z.string(),
});

export const randomNumbersSettings = defineFeatureSettings<RandomNumbersParams>({
  namespace: 'random-numbers',
  schema,
  defaults: RANDOM_NUMBERS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const randomNumbersBinding = createSettingsBinding(randomNumbersSettings);

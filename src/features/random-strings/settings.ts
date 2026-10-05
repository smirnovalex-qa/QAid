import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { MAX_COUNT, MAX_LENGTH, RANDOM_STRINGS_DEFAULTS } from './types';
import type { RandomStringsParams } from './types';

// Схема набора символов алфавита.
const alphabetSchema = z.object({
  latinLower: z.boolean(),
  latinUpper: z.boolean(),
  cyrillicLower: z.boolean(),
  cyrillicUpper: z.boolean(),
  digits: z.boolean(),
  special: z.boolean(),
  emoji: z.boolean(),
  custom: z.string(),
});

// Схема параметров фичи «Случайные строки».
const schema: z.ZodType<RandomStringsParams, z.ZodTypeDef, unknown> = z.object({
  alphabet: alphabetSchema,
  lengthFrom: z.number().int().min(0).max(MAX_LENGTH),
  lengthTo: z.number().int().min(0).max(MAX_LENGTH),
  prefix: z.string(),
  suffix: z.string(),
  caseTransform: z.enum(['none', 'upper', 'lower', 'title']),
  count: z.number().int().min(1).max(MAX_COUNT),
});

export const randomStringsSettings = defineFeatureSettings<RandomStringsParams>({
  namespace: 'random-strings',
  schema,
  defaults: RANDOM_STRINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const randomStringsBinding = createSettingsBinding(randomStringsSettings);

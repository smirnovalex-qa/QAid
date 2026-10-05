/**
 * Слой настроек фичи «Инспектор: палитра цветов» (TASK-005): персист выбранного
 * цветового формата и порядка сортировки. Один binding на namespace (синглтон).
 */
import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { PALETTE_DEFAULTS } from '@/shared/inspection/palette/types';
import type { PaletteSettingsState } from '@/shared/inspection/palette/types';

const schema: z.ZodType<PaletteSettingsState, z.ZodTypeDef, unknown> = z.object({
  format: z.enum(['hex', 'rgb', 'hsl']),
  sort: z.enum(['frequency', 'hue', 'lightness']),
});

export const paletteSettings = defineFeatureSettings<PaletteSettingsState>({
  namespace: 'inspector-palette',
  schema,
  defaults: PALETTE_DEFAULTS,
});

export const paletteBinding = createSettingsBinding(paletteSettings);

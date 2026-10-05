import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { SNAPSHOT_DIFF_SETTINGS_DEFAULTS } from './types';
import type { SnapshotDiffSettingsState } from './types';

// Схема персистентного состояния фичи «Snapshot-diff»: предпочтение фильтра.
const schema: z.ZodType<SnapshotDiffSettingsState, z.ZodTypeDef, unknown> = z.object({
  filter: z.enum(['all', 'structure', 'styles', 'text']),
});

export const snapshotDiffSettings = defineFeatureSettings<SnapshotDiffSettingsState>({
  namespace: 'snapshot-diff',
  schema,
  defaults: SNAPSHOT_DIFF_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const snapshotDiffBinding = createSettingsBinding(snapshotDiffSettings);

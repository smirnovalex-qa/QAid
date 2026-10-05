import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { DomOverrideEntrySchema } from '@/shared/inspection/dom-override/messages';
import { DOM_OVERRIDE_SETTINGS_DEFAULTS } from '@/shared/inspection/dom-override/types';
import type { DomOverrideSettingsState } from '@/shared/inspection/dom-override/types';

// Персистентное состояние фичи «DOM-подмена» (namespace `dom-override`): список
// подмен. Схема записи переиспользуется из контракта сообщений — единый источник формы.
const schema: z.ZodType<DomOverrideSettingsState, z.ZodTypeDef, unknown> = z.object({
  overrides: z.array(DomOverrideEntrySchema),
});

export const domOverrideSettings = defineFeatureSettings<DomOverrideSettingsState>({
  namespace: 'dom-override',
  schema,
  defaults: DOM_OVERRIDE_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const domOverrideBinding = createSettingsBinding(domOverrideSettings);

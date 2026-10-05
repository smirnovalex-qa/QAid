import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { SCREEN_RECORDING_SETTINGS_DEFAULTS } from './types';
import type { ScreenRecordingSettingsState } from './types';

// Схема персистентного состояния: аудио-опции + лимит длительности. Источник видео
// больше НЕ хранится (с ревизии 2026-09-21 / bugfix 4 поверхность выбирается в нативном
// пикере при каждом старте).
//
// ОБРАТНАЯ СОВМЕСТИМОСТЬ: старые снимки несли `source`/`desktopKind`/`tabAudio`.
// `z.object` отбрасывает неизвестные ключи (`source`/`desktopKind`), а `preprocess`
// переносит прежний `tabAudio` в новый `systemAudio`, чтобы выбор звука не сбросился.
// Отсутствующие ключи заполняются дефолтами (`.default(...)`).
const schema: z.ZodType<ScreenRecordingSettingsState, z.ZodTypeDef, unknown> = z.preprocess(
  (raw) => {
    if (raw !== null && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (r.systemAudio === undefined && typeof r.tabAudio === 'boolean') {
        return { ...r, systemAudio: r.tabAudio };
      }
    }
    return raw;
  },
  z.object({
    mic: z.boolean().default(false),
    systemAudio: z.boolean().default(true),
    maxDurationMs: z.number().int().positive().default(300_000),
  }),
);

export const screenRecordingSettings = defineFeatureSettings<ScreenRecordingSettingsState>({
  // Namespace совпадает с именем директории фичи (конвенция слоя настроек).
  namespace: 'screen-recording',
  schema,
  defaults: SCREEN_RECORDING_SETTINGS_DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const screenRecordingBinding = createSettingsBinding(screenRecordingSettings);

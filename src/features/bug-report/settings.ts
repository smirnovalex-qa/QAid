import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import {
  BUG_REPORT_DEFAULTS,
  DEFAULT_HANDOFF_SETTINGS,
  DEFAULT_PROMPT_LIMIT,
  DEFAULT_TIMELINE_LIMIT,
  DEFAULT_TIMELINE_SETTINGS,
} from './types';
import type { BugReportSettingsState } from './types';

// Персистентное состояние фичи «Экспорт состояния бага» (namespace `bug-report`):
// последний выбор секций, флаг маскирования и настройки таймлайна (TASK-036).
// Приватность — часть контракта: дефолт хранит storage/cookies и таймлайн выключенными
// (см. `DEFAULT_SECTIONS`), а маскирование значений ввода в таймлайне — включённым.
//
// ОБРАТНАЯ СОВМЕСТИМОСТЬ: новые поля добавлены через `.default(...)` — старые снимки
// без `sections.timeline` / без `timeline` парсятся валидно (заполняются дефолтами).
const schema: z.ZodType<BugReportSettingsState, z.ZodTypeDef, unknown> = z.object({
  sections: z.object({
    environment: z.boolean(),
    storage: z.boolean(),
    console: z.boolean(),
    network: z.boolean(),
    timeline: z.boolean().default(true),
    note: z.boolean(),
  }),
  mask: z.boolean(),
  timeline: z
    .object({
      maskInputs: z.boolean().default(true),
      limit: z.number().int().positive().default(DEFAULT_TIMELINE_LIMIT),
    })
    .default({ ...DEFAULT_TIMELINE_SETTINGS }),
  // Компаньон-скриншот в момент фиксации: добавлен через `.default` — старые снимки
  // без ключа парсятся валидно.
  screenshot: z.boolean().default(true),
  // Доставка агенту (TASK-040): весь блок добавлен через `.default` — старые снимки
  // без ключа `handoff` парсятся валидно (заполняются дефолтами).
  handoff: z
    .object({
      lastTargetId: z.string().default(DEFAULT_HANDOFF_SETTINGS.lastTargetId),
      projectRepo: z.string().default(''),
      projectCwd: z.string().default(''),
      includeJson: z.boolean().default(false),
      promptLimit: z.number().int().positive().default(DEFAULT_PROMPT_LIMIT),
    })
    .default({ ...DEFAULT_HANDOFF_SETTINGS }),
});

export const bugReportSettings = defineFeatureSettings<BugReportSettingsState>({
  namespace: 'bug-report',
  schema,
  defaults: BUG_REPORT_DEFAULTS,
});

export const bugReportBinding = createSettingsBinding(bugReportSettings);

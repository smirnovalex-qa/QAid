import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { MockRuleSchema, MockScenarioSchema } from './rules';
import { ReplayHistoryEntrySchema } from './replay/schema';
import { MOCK_NETWORK_DEFAULTS } from './types';
import type { MockNetworkSettingsState } from './types';

// Персистентное состояние фичи «Мок сети» (namespace `mock-network`): набор правил,
// строка фильтра, стратегия перехвата и сценарии (TASK-023). Схемы правила/сценария
// переиспользуются из `rules.ts` — единый источник формы. `scenarios`/`activeScenarioId`
// через `.default` — обратная совместимость: состояние, сохранённое до TASK-023, парсится
// без сброса к дефолтам (иначе потеря правил).
//
// Мастер-тумблер `enabled` СОЗНАТЕЛЬНО не в схеме (см. `MockNetworkSettingsState`): его
// персист давал бы «фантомно-включённую» панель без привязки к реально стоящему
// перехватчику (другая вкладка, перезапуск SW). Живую активность панель узнаёт сверкой с
// фоном при маунте (`mock/status`), а не из настроек. zod-объект нестрогий → старые блобы
// с полем `enabled` парсятся без ошибки (ключ просто отбрасывается).
const schema: z.ZodType<MockNetworkSettingsState, z.ZodTypeDef, unknown> = z.object({
  rules: z.array(MockRuleSchema),
  filter: z.string(),
  strategy: z.enum(['main', 'cdp']),
  scenarios: z.array(MockScenarioSchema).default([]),
  activeScenarioId: z.string().nullable().default(null),
  // Поле TASK-038 через `.default` — обратная совместимость: блобы, сохранённые до
  // replay, парсятся без сброса набора правил/сценариев (zod-объект нестрогий).
  replayHistory: z.array(ReplayHistoryEntrySchema).default([]),
});

export const mockNetworkSettings = defineFeatureSettings<MockNetworkSettingsState>({
  namespace: 'mock-network',
  schema,
  defaults: MOCK_NETWORK_DEFAULTS,
});

export const mockNetworkBinding = createSettingsBinding(mockNetworkSettings);

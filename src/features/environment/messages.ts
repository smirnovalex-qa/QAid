/**
 * RPC-контракты фичи «Эмуляция окружения» (TASK-019). Адресат — `background`
 * (по умолчанию): подмена заголовков (DNR session-rules) и инъекция MAIN-world
 * оверрайдов доступны только из service worker'а, поэтому UI шлёт запрос туда, а
 * не в content напрямую (в отличие от инспекционного слоя). Валидация zod — на
 * границе (роутер `installRouter`).
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/** Схема геолокации (совпадает с `GeoConfig` из types.ts). */
export const GeoConfigSchema = z.object({
  mode: z.enum(['off', 'coords', 'error']),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number(),
  errorCode: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

/** Схема полного конфига подмены окружения (совпадает с `EnvironmentConfig`). */
export const EnvironmentConfigSchema = z.object({
  userAgent: z.string().nullable(),
  acceptLanguage: z.string().nullable(),
  timezone: z.string().nullable(),
  geo: GeoConfigSchema,
});

/** База запроса: адрес вкладки, к которой применяется/снимается эмуляция. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/**
 * `environment/apply` — применить конфиг к вкладке: поставить DNR session-rules
 * подмены заголовков и инъектировать MAIN-world оверрайды (navigator/Intl/geo).
 */
export const EnvironmentApply = defineMessage(
  'environment/apply',
  TabTarget.extend({ config: EnvironmentConfigSchema }),
  z.object({ ok: z.boolean() }),
);

/**
 * `environment/clear` — снять эмуляцию с вкладки: убрать DNR-правила и вернуть
 * страницу в исходное состояние (инъекция restore-оверрайдов).
 */
export const EnvironmentClear = defineMessage(
  'environment/clear',
  TabTarget,
  z.object({ ok: z.literal(true) }),
);

/** Все контракты фичи — для регистрации в дескрипторе (`FeatureModule.messages`). */
export const environmentMessages = [EnvironmentApply, EnvironmentClear];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'environment/apply': {
      request: z.infer<typeof EnvironmentApply.request>;
      response: z.infer<typeof EnvironmentApply.response>;
    };
    'environment/clear': {
      request: z.infer<typeof EnvironmentClear.request>;
      response: z.infer<typeof EnvironmentClear.response>;
    };
  }
}

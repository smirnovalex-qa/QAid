/**
 * RPC-контракты фичи «Мок сети» (TASK-022). Адресат — `background` (по умолчанию):
 * MAIN-world инъекция перехватчика и опрос лога доступны только из service worker'а
 * (как у эмуляции окружения), поэтому UI шлёт запрос туда, а не в content напрямую.
 * Валидация zod — на границе роутера. Правила уходят «сырыми»; компиляция в
 * сериализуемую форму — в background (`compileRules`), чтобы UI оставался лёгким.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import { MockRuleSchema } from './rules';
import { ReplayResultSchema, RequestSpecSchema } from './replay/schema';

const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/** Снимок пойманного запроса (совпадает с `CaughtRequest`). */
export const CaughtRequestSchema = z.object({
  id: z.number(),
  method: z.string(),
  url: z.string(),
  status: z.number(),
  mocked: z.boolean(),
  ruleId: z.string().nullable(),
  source: z.enum(['fetch', 'xhr']),
  sizeBytes: z.number(),
  durationMs: z.number(),
  startedAt: z.number(),
  error: z.string().nullable(),
});

/**
 * `mock/apply` — включить перехват на вкладке с набором правил. `strategy` `main`:
 * скомпилировать и инъектировать MAIN-перехватчик + ре-инъекция при навигации. `cdp`
 * (TASK-032): подключить отладчик и включить CDP `Fetch`-перехват; отказ подключения
 * → `ok:false` + `reason` (`attach-failed`/`enable-failed`) для fallback на MAIN.
 */
export const MockApply = defineMessage(
  'mock/apply',
  TabTarget.extend({
    rules: z.array(MockRuleSchema),
    strategy: z.enum(['main', 'cdp']),
  }),
  z.object({ ok: z.boolean(), reason: z.string().optional() }),
);

/** `mock/clear` — снять перехват с вкладки (вернуть fetch/XHR) и забыть её. */
export const MockClear = defineMessage('mock/clear', TabTarget, z.object({ ok: z.literal(true) }));

/**
 * `mock/observe` — зарегистрировать потребителя «только лог» (без правил): наблюдение
 * за fetch/XHR для внешних фич (напр. «Экспорт бага», TASK-025). Ref-count в общей
 * сессии перехвата: НЕ затирает правила активного мока и НЕ убивает его сессию — оба
 * потребителя сосуществуют, перехватчик жив, пока нужен хоть одному.
 */
export const MockObserve = defineMessage(
  'mock/observe',
  TabTarget,
  z.object({ ok: z.literal(true) }),
);

/** `mock/observeStop` — снять потребителя-наблюдателя (перехватчик жив, пока нужен моку). */
export const MockObserveStop = defineMessage(
  'mock/observeStop',
  TabTarget,
  z.object({ ok: z.literal(true) }),
);

/**
 * `mock/poll` — забрать снимок пойманных запросов вкладки (для живого списка).
 * `active` (TASK-032) — жив ли транспорт: для CDP отражает наличие сессии (после
 * ручного detach пользователем станет `false`, и панель честно остановит перехват);
 * для MAIN всегда `true`. Опционально ради обратной совместимости контракта.
 */
export const MockPoll = defineMessage(
  'mock/poll',
  TabTarget,
  z.object({ entries: z.array(CaughtRequestSchema), active: z.boolean().optional() }),
);

/**
 * `mock/status` — активен ли перехват на вкладке ПРЯМО СЕЙЧАС. Источник истины — фон
 * (ref-count MAIN-сессии / реестр CDP), а не локальный стейт панели: инъектированный
 * перехватчик живёт в СТРАНИЦЕ и переживает закрытие popup/side panel, поэтому
 * переоткрытая панель обязана свериться с фоном, иначе покажет «выключено», пока сайт
 * продолжает получать моки. `strategy` — каким транспортом он активен (для точной сверки
 * UI и восстановления строгого режима).
 */
export const MockStatus = defineMessage(
  'mock/status',
  TabTarget,
  z.object({ active: z.boolean(), strategy: z.enum(['main', 'cdp']) }),
);

/**
 * `mock/replay` (TASK-038) — переотправить скомпонованный запрос из контекста
 * расширения (host-право, обход CORS страницы). Запрос — `RequestSpec`; ответ —
 * дискриминируемый `ReplayResult` (ответ либо типизированный сбой сети/таймаута/
 * превышения размера): sender никогда не бросает в UI. Только по явному действию
 * пользователя; безопасность мутирующих методов — подтверждением в UI.
 */
export const MockReplay = defineMessage('mock/replay', RequestSpecSchema, ReplayResultSchema);

/** Все контракты фичи — для дескриптора (`FeatureModule.messages`). */
export const mockNetworkMessages = [
  MockApply,
  MockClear,
  MockObserve,
  MockObserveStop,
  MockPoll,
  MockStatus,
  MockReplay,
];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'mock/apply': {
      request: z.infer<typeof MockApply.request>;
      response: z.infer<typeof MockApply.response>;
    };
    'mock/clear': {
      request: z.infer<typeof MockClear.request>;
      response: z.infer<typeof MockClear.response>;
    };
    'mock/observe': {
      request: z.infer<typeof MockObserve.request>;
      response: z.infer<typeof MockObserve.response>;
    };
    'mock/observeStop': {
      request: z.infer<typeof MockObserveStop.request>;
      response: z.infer<typeof MockObserveStop.response>;
    };
    'mock/poll': {
      request: z.infer<typeof MockPoll.request>;
      response: z.infer<typeof MockPoll.response>;
    };
    'mock/status': {
      request: z.infer<typeof MockStatus.request>;
      response: z.infer<typeof MockStatus.response>;
    };
    'mock/replay': {
      request: z.infer<typeof MockReplay.request>;
      response: z.infer<typeof MockReplay.response>;
    };
  }
}

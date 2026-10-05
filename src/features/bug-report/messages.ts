/**
 * RPC-контракты фичи «Экспорт состояния бага» (TASK-025). Адресат — `background`
 * (по умолчанию): MAIN-world инъекция сборщиков (окружение + кольцевой буфер
 * консоли) и опрос буфера доступны только из service worker'а (как у мока сети и
 * эмуляции окружения), поэтому UI шлёт запрос туда, а не в content напрямую.
 * Валидация zod — на границе роутера.
 *
 * Переиспользование (НЕ дублировать сбор): сетевая секция берётся существующим
 * `mock/poll` (TASK-022), снимок storage/cookies — существующими `storage/*` и
 * `cookies/*` (TASK-017). Здесь объявлены только СВОИ контракты: окружение и консоль.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import {
  ActionRecordSchema,
  ConsoleEntrySchema,
  EnvironmentPartSchema,
  MetaPartSchema,
  TimelineClockAnchorSchema,
} from './logic';

const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/**
 * `bugReport/collectEnv` — инъектировать MAIN-сборщики и вернуть базовую секцию
 * (URL/заголовок) + снимок окружения активной вкладки одним запросом.
 */
export const BugCollectEnv = defineMessage(
  'bugReport/collectEnv',
  TabTarget,
  z.object({ meta: MetaPartSchema, environment: EnvironmentPartSchema }),
);

/**
 * `bugReport/consoleInstall` — поставить (или обновить `cap`) кольцевой буфер
 * консоли на вкладке: перехват error/warn + глобальных ошибок, ре-инъекция при
 * навигации. Буфер копит сообщения ДО момента снимка.
 */
export const BugConsoleInstall = defineMessage(
  'bugReport/consoleInstall',
  TabTarget.extend({ cap: z.number().int().positive() }),
  z.object({ ok: z.literal(true) }),
);

/** `bugReport/consoleRead` — забрать снимок кольцевого буфера консоли вкладки. */
export const BugConsoleRead = defineMessage(
  'bugReport/consoleRead',
  TabTarget,
  z.object({ entries: z.array(ConsoleEntrySchema) }),
);

/** `bugReport/consoleClear` — снять перехват консоли на вкладке (teardown) и забыть её. */
export const BugConsoleClear = defineMessage(
  'bugReport/consoleClear',
  TabTarget,
  z.object({ ok: z.literal(true) }),
);

/**
 * `bugReport/actionsInstall` — поставить (или обновить `cap`/`maskInputs`) кольцевой
 * буфер действий на вкладке (TASK-036): делегированные пассивные слушатели + ре-инъекция
 * при навигации. Значения ввода маскируются, если `maskInputs` (пароль — всегда).
 */
export const BugActionsInstall = defineMessage(
  'bugReport/actionsInstall',
  TabTarget.extend({ cap: z.number().int().positive(), maskInputs: z.boolean() }),
  z.object({ ok: z.literal(true) }),
);

/** `bugReport/actionsRead` — забрать снимок буфера действий + якорь клоков вкладки. */
export const BugActionsRead = defineMessage(
  'bugReport/actionsRead',
  TabTarget,
  z.object({ events: z.array(ActionRecordSchema), anchor: TimelineClockAnchorSchema }),
);

/** `bugReport/actionsPause` — поставить/снять паузу записи действий на вкладке. */
export const BugActionsPause = defineMessage(
  'bugReport/actionsPause',
  TabTarget.extend({ paused: z.boolean() }),
  z.object({ ok: z.literal(true) }),
);

/**
 * `bugReport/actionsStop` — остановить запись на вкладке: снять слушатели/хуки, но
 * СОХРАНИТЬ накопленный лог читаемым (TASK-036), чтобы Capture после Stop включил шаги.
 */
export const BugActionsStop = defineMessage(
  'bugReport/actionsStop',
  TabTarget,
  z.object({ ok: z.literal(true) }),
);

/** `bugReport/actionsClear` — снять слушатели действий на вкладке (teardown) и забыть её (полный сброс). */
export const BugActionsClear = defineMessage(
  'bugReport/actionsClear',
  TabTarget,
  z.object({ ok: z.literal(true) }),
);

/** Все контракты фичи — для дескриптора (`FeatureModule.messages`). */
export const bugReportMessages = [
  BugCollectEnv,
  BugConsoleInstall,
  BugConsoleRead,
  BugConsoleClear,
  BugActionsInstall,
  BugActionsRead,
  BugActionsPause,
  BugActionsStop,
  BugActionsClear,
];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'bugReport/collectEnv': {
      request: z.infer<typeof BugCollectEnv.request>;
      response: z.infer<typeof BugCollectEnv.response>;
    };
    'bugReport/consoleInstall': {
      request: z.infer<typeof BugConsoleInstall.request>;
      response: z.infer<typeof BugConsoleInstall.response>;
    };
    'bugReport/consoleRead': {
      request: z.infer<typeof BugConsoleRead.request>;
      response: z.infer<typeof BugConsoleRead.response>;
    };
    'bugReport/consoleClear': {
      request: z.infer<typeof BugConsoleClear.request>;
      response: z.infer<typeof BugConsoleClear.response>;
    };
    'bugReport/actionsInstall': {
      request: z.infer<typeof BugActionsInstall.request>;
      response: z.infer<typeof BugActionsInstall.response>;
    };
    'bugReport/actionsRead': {
      request: z.infer<typeof BugActionsRead.request>;
      response: z.infer<typeof BugActionsRead.response>;
    };
    'bugReport/actionsPause': {
      request: z.infer<typeof BugActionsPause.request>;
      response: z.infer<typeof BugActionsPause.response>;
    };
    'bugReport/actionsStop': {
      request: z.infer<typeof BugActionsStop.request>;
      response: z.infer<typeof BugActionsStop.response>;
    };
    'bugReport/actionsClear': {
      request: z.infer<typeof BugActionsClear.request>;
      response: z.infer<typeof BugActionsClear.response>;
    };
  }
}

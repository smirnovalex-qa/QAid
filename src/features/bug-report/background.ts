/**
 * Фоновый оркестратор «Экспорт состояния бага» (TASK-025). Реализует доменные
 * хендлеры `bugReport/collectEnv` и `bugReport/console*` поверх платформенного seam
 * (MAIN-world инъекция сборщиков). Прямой `chrome.*` вне платформы запрещён
 * (ADR-0014) — всё через `@/platform`.
 *
 * Кольцевой буфер консоли живёт в MAIN-world и НЕ переживает навигацию документа,
 * поэтому фон следит за навигацией вкладок с активным буфером (`tabEvents.onUpdated`)
 * и инъектирует его заново (cap берём из реестра `active`) — чтобы копить сообщения
 * и после перезагрузки страницы. При закрытии вкладки — забываем её. Реестр `active`
 * живёт в памяти SW (как у мока сети).
 *
 * Сбор окружения — разовая инъекция читающих функций (буфер не нужен). Сетевую
 * секцию и снимок storage/cookies фон здесь НЕ трогает: UI берёт их существующими
 * контрактами (`mock/poll`, `storage/*`, `cookies/*`) — переиспользование, не дубль.
 */
import './messages';
import type { BackgroundHandler } from '@/features/registry';
import type { RequestOf } from '@/shared/messaging/contract';
import { scriptingMain, tabEvents } from '@/platform';
import { logger } from '@/shared/logger';
import type { ActionsSnapshot, ConsoleEntry, EnvironmentPart, MetaPart } from './types';
import { readEnvironmentSnapshot, readPageMeta } from './collectors/environment';
import { clearConsoleBuffer, installConsoleBuffer, readConsoleBuffer } from './collectors/console';
import {
  clearActionsBuffer,
  installActionsBuffer,
  readActionsBuffer,
  setActionsPaused,
} from './collectors/actions';

/** Вкладки с установленным буфером консоли → их `cap` (для ре-инъекции при навигации). */
const active = new Map<number, number>();
/** Вкладки с буфером действий → их `{ cap, maskInputs }` (для ре-инъекции при навигации). */
const activeActions = new Map<number, { cap: number; maskInputs: boolean }>();
let lifecycleInstalled = false;

/** Первый `result` из ответа `executeScript` (массив по фреймам) либо fallback. */
function firstResult<T>(res: unknown, fallback: T): T {
  return (res as { result?: T }[] | undefined)?.[0]?.result ?? fallback;
}

/** Ленивая установка слушателей навигации/закрытия вкладок (единожды). */
function installLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  tabEvents.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return;
    // Навигация сбросила MAIN-буферы — ставим их заново как можно раньше.
    const cap = active.get(tabId);
    if (cap !== undefined) {
      void scriptingMain.run(tabId, installConsoleBuffer, [cap], true).catch((e: unknown) => {
        logger.debug('bugReport.console.reinject', e);
      });
    }
    const acts = activeActions.get(tabId);
    if (acts !== undefined) {
      void scriptingMain
        .run(tabId, installActionsBuffer, [acts.cap, acts.maskInputs], true)
        .catch((e: unknown) => {
          logger.debug('bugReport.actions.reinject', e);
        });
    }
  });

  tabEvents.onRemoved.addListener((tabId) => {
    active.delete(tabId);
    activeActions.delete(tabId);
  });
}

async function collectEnv(
  req: RequestOf<'bugReport/collectEnv'>,
): Promise<{ meta: MetaPart; environment: EnvironmentPart }> {
  const { tabId } = req;
  const metaRes = await scriptingMain.run(tabId, readPageMeta, []);
  const envRes = await scriptingMain.run(tabId, readEnvironmentSnapshot, []);
  const meta = firstResult<MetaPart>(metaRes, { url: '', title: '' });
  const environment = firstResult<EnvironmentPart>(envRes, {
    userAgent: '',
    language: '',
    languages: [],
    platform: '',
    viewport: { width: 0, height: 0 },
    screen: { width: 0, height: 0 },
    devicePixelRatio: 1,
    locale: '',
    timeZone: '',
    isoTime: '',
    online: false,
    cookieEnabled: false,
  });
  return { meta, environment };
}

async function consoleInstall(req: RequestOf<'bugReport/consoleInstall'>): Promise<{ ok: true }> {
  installLifecycle();
  const { tabId, cap } = req;
  await scriptingMain.run(tabId, installConsoleBuffer, [cap], false);
  active.set(tabId, cap);
  return { ok: true };
}

async function consoleRead(
  req: RequestOf<'bugReport/consoleRead'>,
): Promise<{ entries: ConsoleEntry[] }> {
  const { tabId } = req;
  try {
    const res = await scriptingMain.run(tabId, readConsoleBuffer, []);
    return { entries: firstResult<ConsoleEntry[]>(res, []) };
  } catch (e) {
    logger.debug('bugReport.console.read', e);
    return { entries: [] };
  }
}

async function consoleClear(req: RequestOf<'bugReport/consoleClear'>): Promise<{ ok: true }> {
  const { tabId } = req;
  active.delete(tabId);
  // best-effort: вкладка могла быть уже закрыта/недоступна.
  await scriptingMain.run(tabId, clearConsoleBuffer, []).catch((e: unknown) => {
    logger.debug('bugReport.console.clear', e);
  });
  return { ok: true };
}

async function actionsInstall(req: RequestOf<'bugReport/actionsInstall'>): Promise<{ ok: true }> {
  installLifecycle();
  const { tabId, cap, maskInputs } = req;
  await scriptingMain.run(tabId, installActionsBuffer, [cap, maskInputs], false);
  activeActions.set(tabId, { cap, maskInputs });
  return { ok: true };
}

async function actionsRead(req: RequestOf<'bugReport/actionsRead'>): Promise<ActionsSnapshot> {
  const { tabId } = req;
  try {
    const res = await scriptingMain.run(tabId, readActionsBuffer, []);
    return firstResult<ActionsSnapshot>(res, {
      events: [],
      anchor: { perfNow: 0, wall: Date.now() },
    });
  } catch (e) {
    logger.debug('bugReport.actions.read', e);
    return { events: [], anchor: { perfNow: 0, wall: Date.now() } };
  }
}

async function actionsPause(req: RequestOf<'bugReport/actionsPause'>): Promise<{ ok: true }> {
  const { tabId, paused } = req;
  // Пауза — рантайм-флаг в MAIN-world; реестр `activeActions` не трогаем (нужен для
  // ре-инъекции при навигации, где буфер стартует непаузированным заново).
  await scriptingMain.run(tabId, setActionsPaused, [paused]).catch((e: unknown) => {
    logger.debug('bugReport.actions.pause', e);
  });
  return { ok: true };
}

async function actionsStop(req: RequestOf<'bugReport/actionsStop'>): Promise<{ ok: true }> {
  const { tabId } = req;
  // Прекращаем ре-инъекцию при навигации, но лог оставляем читаемым (keepLog=true) —
  // Capture после Stop должен включить записанные шаги.
  activeActions.delete(tabId);
  await scriptingMain.run(tabId, clearActionsBuffer, [true]).catch((e: unknown) => {
    logger.debug('bugReport.actions.stop', e);
  });
  return { ok: true };
}

async function actionsClear(req: RequestOf<'bugReport/actionsClear'>): Promise<{ ok: true }> {
  const { tabId } = req;
  activeActions.delete(tabId);
  await scriptingMain.run(tabId, clearActionsBuffer, [false]).catch((e: unknown) => {
    logger.debug('bugReport.actions.clear', e);
  });
  return { ok: true };
}

/**
 * Доменные хендлеры фичи. Подключаются в SW из background-барели
 * (`@/features/background` → `registerBackground`, ADR-0047); вход уже провалидирован
 * zod в роутере.
 */
export const bugReportBackgroundHandlers: BackgroundHandler[] = [
  {
    type: 'bugReport/collectEnv',
    handler: (req) => collectEnv(req as RequestOf<'bugReport/collectEnv'>),
  },
  {
    type: 'bugReport/consoleInstall',
    handler: (req) => consoleInstall(req as RequestOf<'bugReport/consoleInstall'>),
  },
  {
    type: 'bugReport/consoleRead',
    handler: (req) => consoleRead(req as RequestOf<'bugReport/consoleRead'>),
  },
  {
    type: 'bugReport/consoleClear',
    handler: (req) => consoleClear(req as RequestOf<'bugReport/consoleClear'>),
  },
  {
    type: 'bugReport/actionsInstall',
    handler: (req) => actionsInstall(req as RequestOf<'bugReport/actionsInstall'>),
  },
  {
    type: 'bugReport/actionsRead',
    handler: (req) => actionsRead(req as RequestOf<'bugReport/actionsRead'>),
  },
  {
    type: 'bugReport/actionsPause',
    handler: (req) => actionsPause(req as RequestOf<'bugReport/actionsPause'>),
  },
  {
    type: 'bugReport/actionsStop',
    handler: (req) => actionsStop(req as RequestOf<'bugReport/actionsStop'>),
  },
  {
    type: 'bugReport/actionsClear',
    handler: (req) => actionsClear(req as RequestOf<'bugReport/actionsClear'>),
  },
];

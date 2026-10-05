/**
 * Мост UI↔background для «Экспорта состояния бага» (TASK-025). Тонкие типобезопасные
 * обёртки над `sendMessage`: сбор окружения/консоли — своими контрактами; сеть и
 * storage/cookies — ПЕРЕИСПОЛЬЗУЕМЫМИ контрактами других фич (не дублируем сбор).
 * Ошибки не бросаются наружу — нормализуются в удобные для UI значения.
 */
import { sendMessage } from '@/shared/messaging/bus';
import type { StorageSnapshot } from '@/shared/inspection/storage/types';
import type { ResponseOf } from '@/shared/messaging/contract';
import { toNetworkPart } from './collectors/network';
import type { TimelineNetworkInput } from './logic';
import type {
  ActionsSnapshot,
  ConsoleEntry,
  EnvironmentPart,
  MetaPart,
  NetworkPart,
} from './types';

/** Инъектирует MAIN-сборщики и возвращает базовую секцию + окружение. `null` при ошибке. */
export async function collectEnv(
  tabId: number,
): Promise<{ meta: MetaPart; environment: EnvironmentPart } | null> {
  const res = await sendMessage('bugReport/collectEnv', { tabId });
  return res.ok ? res.value : null;
}

/** Ставит (или обновляет) кольцевой буфер консоли на вкладке. Возвращает успех. */
export async function installConsole(tabId: number, cap: number): Promise<boolean> {
  const res = await sendMessage('bugReport/consoleInstall', { tabId, cap });
  return res.ok;
}

/** Забирает снимок буфера консоли вкладки (пустой массив при любой ошибке). */
export async function readConsole(tabId: number): Promise<ConsoleEntry[]> {
  const res = await sendMessage('bugReport/consoleRead', { tabId });
  return res.ok ? res.value.entries : [];
}

/** Снимает перехват консоли на вкладке (best-effort). */
export async function clearConsole(tabId: number): Promise<void> {
  await sendMessage('bugReport/consoleClear', { tabId });
}

/** Ставит (или обновляет) кольцевой буфер действий на вкладке. Возвращает успех. */
export async function installActions(
  tabId: number,
  cap: number,
  maskInputs: boolean,
): Promise<boolean> {
  const res = await sendMessage('bugReport/actionsInstall', { tabId, cap, maskInputs });
  return res.ok;
}

/** Забирает снимок буфера действий + якорь клоков (пустой снимок при любой ошибке). */
export async function readActions(tabId: number): Promise<ActionsSnapshot> {
  const res = await sendMessage('bugReport/actionsRead', { tabId });
  return res.ok ? res.value : { events: [], anchor: { perfNow: 0, wall: Date.now() } };
}

/** Ставит/снимает паузу записи действий на вкладке (best-effort). */
export async function pauseActions(tabId: number, paused: boolean): Promise<void> {
  await sendMessage('bugReport/actionsPause', { tabId, paused });
}

/**
 * Останавливает запись на вкладке, СОХРАНЯЯ накопленный лог читаемым (best-effort):
 * Capture после Stop должен включить записанные шаги. Полный сброс — `clearActions`.
 */
export async function stopActions(tabId: number): Promise<void> {
  await sendMessage('bugReport/actionsStop', { tabId });
}

/** Снимает слушатели действий на вкладке и забывает буфер — полный сброс (best-effort). */
export async function clearActions(tabId: number): Promise<void> {
  await sendMessage('bugReport/actionsClear', { tabId });
}

/**
 * Включает ЗАПИСЬ сети для отчёта: регистрирует потребителя «только лог» в ОБЩЕЙ
 * сессии перехвата (`mock/observe`, TASK-025 ← ref-count поверх TASK-022). Логируются
 * все fetch/XHR (`mocked:false`), с ре-инъекцией при навигации. Через ГЛОБАЛЬНЫЙ
 * контракт, без прямого импорта фичи (fitness §12.1). Возвращает успех.
 *
 * Ref-count снимает конфликты с «Мок сети»: наблюдатель и мок сосуществуют на одной
 * вкладке — армирование записи НЕ затирает правила мока, а выключение НЕ убивает его
 * сессию (перехватчик жив, пока нужен хоть одному потребителю).
 */
export async function armNetworkLog(tabId: number): Promise<boolean> {
  const res = await sendMessage('mock/observe', { tabId });
  return res.ok;
}

/** Снимает потребителя-наблюдателя сети на вкладке (best-effort; мок не затрагивается). */
export async function disarmNetworkLog(tabId: number): Promise<void> {
  await sendMessage('mock/observeStop', { tabId });
}

/**
 * Сырые сетевые записи (с монотонным `startedAt`) для оси таймлайна — через тот же
 * ПЕРЕИСПОЛЬЗУЕМЫЙ `mock/poll` (TASK-022). `null`, если мок-фича не активна.
 */
export async function collectNetworkTimeline(
  tabId: number,
): Promise<TimelineNetworkInput[] | null> {
  const res = await sendMessage('mock/poll', { tabId });
  if (!res.ok) return null;
  const entries: ResponseOf<'mock/poll'>['entries'] = res.value.entries;
  if (entries.length === 0) return null;
  return entries.map((e) => ({
    method: e.method,
    url: e.url,
    status: e.status,
    mocked: e.mocked,
    durationMs: e.durationMs,
    error: e.error,
    startedAt: e.startedAt,
  }));
}

/**
 * Сетевая секция через ПЕРЕИСПОЛЬЗУЕМЫЙ `mock/poll` (TASK-022). Если мок-фича не
 * активна на вкладке (лог пуст/ошибка) — `toNetworkPart` честно вернёт `available:false`.
 */
export async function collectNetwork(tabId: number): Promise<NetworkPart> {
  const res = await sendMessage('mock/poll', { tabId });
  return toNetworkPart(res.ok ? res.value.entries : null);
}

/**
 * Снимок storage/cookies через ПЕРЕИСПОЛЬЗУЕМЫЕ контракты TASK-017 (`storage/list`
 * ×2 + `cookies/list`). Любая недоступная область деградирует в пустой список, но
 * секция собирается (приватность: прикладывается лишь по явной галочке в UI).
 */
export async function collectStorage(tabId: number): Promise<StorageSnapshot> {
  const [localRes, sessionRes, cookiesRes] = await Promise.all([
    sendMessage('storage/list', { tabId, area: 'local' }),
    sendMessage('storage/list', { tabId, area: 'session' }),
    sendMessage('cookies/list', { tabId }),
  ]);
  return {
    cookies: cookiesRes.ok ? cookiesRes.value.cookies : [],
    local: localRes.ok ? localRes.value.items : [],
    session: sessionRes.ok ? sessionRes.value.items : [],
  };
}

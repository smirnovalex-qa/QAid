/**
 * Управление вкладкой-рекордером из side panel (TASK-037, ревизия 2026-09-22 bugfix 6).
 *
 * Запись С МИКРОФОНОМ ведётся в видимой вкладке расширения, а не в offscreen: `getUserMedia`
 * надёжно отдаёт грант только тому документу, который сам его запросил под жестом; грант,
 * выданный в отдельной вкладке, в offscreen НЕ пробрасывается (корень бага «Доступ
 * отклонён»). Панель лишь ОТКРЫВАЕТ вкладку с параметрами сессии в query и потом ЗАКРЫВАЕТ
 * её; сам захват (`getDisplayMedia` + `getUserMedia` + `MediaRecorder`) и события
 * `state`/`progress`/`blob`/`error` идут из вкладки по общему `BroadcastChannel`.
 *
 * Весь `chrome.*` — через платформенный seam (ADR-0014): `tabs.create`/`tabs.remove` и
 * события `tabEvents.onRemoved` (ручное закрытие вкладки пользователем = остановка).
 */
import { runtime, tabs, tabEvents } from '@/platform';
import type { TabRemovedListener } from '@/platform';
import type { SessionStartParams } from '../session';
import { RECORDER_TAB_PATH, recorderTabQuery } from './params';

/** Полный URL вкладки-рекордера с параметрами сессии в query. */
export function recorderTabUrl(params: SessionStartParams): string {
  return `${runtime.getURL(RECORDER_TAB_PATH)}?${recorderTabQuery(params)}`;
}

/** Живой хендл открытой вкладки-рекордера. */
export interface RecorderTabHandle {
  /** Закрывает вкладку (идемпотентно, best-effort); `onClosed` при этом НЕ шлётся. */
  close: () => Promise<void>;
  /** Подписка на закрытие вкладки пользователем вручную; возвращает отписку. */
  onClosed: (cb: () => void) => () => void;
}

/**
 * Открывает вкладку-рекордер и возвращает хендл. `onClosed` срабатывает, если вкладку
 * закрыл пользователь (панель трактует это как остановку записи).
 */
export async function openRecorderTab(params: SessionStartParams): Promise<RecorderTabHandle> {
  const tabId = await tabs.create({ url: recorderTabUrl(params), active: true });

  let closed = false;
  const listeners = new Set<() => void>();

  const onRemoved: TabRemovedListener = (removedId): void => {
    if (removedId !== tabId || closed) return;
    closed = true;
    for (const cb of listeners) cb();
  };
  if (tabId !== undefined) tabEvents.onRemoved.addListener(onRemoved);

  return {
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      tabEvents.onRemoved.removeListener(onRemoved);
      if (tabId !== undefined) await tabs.remove(tabId).catch(() => undefined);
    },
    onClosed: (cb: () => void): (() => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

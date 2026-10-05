/**
 * Контракт статуса инструментов (v3 «Tool status contract»).
 *
 * Каждая фича может сообщить оболочке `{ live, text } | null`. Это питает список
 * «Активно на этой вкладке» на домашнем экране и живую пилюлю в хедере. Хранилище
 * — модульный signal, чтобы оболочка и (лениво загруженные, развязанные) фичи не
 * знали друг о друге напрямую.
 *
 * В проде источник правды — background/сессия (offscreen-рекордер, armed-буфер,
 * активные DNR-правила, активный мок-сценарий), а не UI-состояние: статус должен
 * переживать закрытие popup. Фича просто зеркалит это состояние сюда через
 * `setToolStatus` при маунте/обновлении и очищает (`null`) при размонтировании.
 */
import { signal } from '@preact/signals';

export interface ToolStatus {
  /** Живая сессия (запись/захват) — красная мигающая индикация. */
  live: boolean;
  /** Короткий текст статуса («3 rules», «0:42 · capturing», «report ready»). */
  text: string;
}

/** id фичи → её текущий статус. Пусто = нет активных инструментов. */
export const toolStatus = signal<Record<string, ToolStatus>>({});

/**
 * Установить/очистить (`null`) статус инструмента по id фичи.
 *
 * Запись в signal ОТЛОЖЕНА через `queueMicrotask`: синхронная запись shared-signal
 * из фазы commit/размонтирования фичи ре-входит в рендер Preact (ошибка "__k" null).
 * Отложенная запись безопасна для всех вызывающих (статус — совещательный), так что
 * фичам больше не нужно оборачивать вызовы самим. Дедуп и вычисление — внутри
 * микротаска, чтобы несколько быстрых вызовов схлопнулись корректно (last-write-wins).
 */
export function setToolStatus(id: string, status: ToolStatus | null): void {
  queueMicrotask(() => {
    const cur = toolStatus.value;
    if (status === null) {
      if (!(id in cur)) return;
      toolStatus.value = Object.fromEntries(Object.entries(cur).filter(([key]) => key !== id));
      return;
    }
    const prev = cur[id];
    if (prev && sameStatus(prev, status)) return;
    toolStatus.value = { ...cur, [id]: status };
  });
}

function sameStatus(a: ToolStatus, b: ToolStatus): boolean {
  return a.live === b.live && a.text === b.text;
}

/** id первой живой (`live`) сессии, если есть. */
export function liveToolId(map: Record<string, ToolStatus>): string | undefined {
  return Object.keys(map).find((id) => map[id]?.live);
}

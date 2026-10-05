/**
 * Лёгкая история replay (TASK-038): последние N спек запросов. СОЗНАТЕЛЬНО НЕ
 * менеджер коллекций (PRD §3 — Postman не цель): плоский список, новые впереди,
 * с капом. Чистые операции над массивом (persist — в `settings.ts` через биндинг).
 *
 * id/время инъектируемы для детерминированных тестов; по умолчанию —
 * `crypto.randomUUID`/`Date.now` (доступны и в UI, и в SW).
 */
import { REPLAY_LIMITS } from '../types';
import type { ReplayHistoryEntry, RequestSpec } from '../types';

/** Глубина истории по умолчанию. */
export const MAX_HISTORY = REPLAY_LIMITS.maxHistory;

function defaultId(): string {
  return `replay-${crypto.randomUUID()}`;
}

/** Глубокая копия спеки — история не должна разделять ссылки с редактором. */
function cloneSpec(spec: RequestSpec): RequestSpec {
  return {
    method: spec.method,
    url: spec.url,
    body: spec.body,
    bodyMode: spec.bodyMode,
    query: spec.query.map((q) => ({ ...q })),
    headers: spec.headers.map((h) => ({ ...h })),
  };
}

/** Строит запись истории из спеки и статуса последнего ответа (null — сбой). */
export function makeHistoryEntry(
  spec: RequestSpec,
  status: number | null,
  deps?: { id?: string; now?: number },
): ReplayHistoryEntry {
  return {
    id: deps?.id ?? defaultId(),
    spec: cloneSpec(spec),
    at: deps?.now ?? Date.now(),
    status,
  };
}

/**
 * Добавляет запись в начало истории и обрезает до `max`. Дедуп не делаем осознанно:
 * порядок хронологический, повторный прогон той же спеки — легитимная новая запись.
 */
export function addHistory(
  list: ReplayHistoryEntry[],
  entry: ReplayHistoryEntry,
  max: number = MAX_HISTORY,
): ReplayHistoryEntry[] {
  const next = [entry, ...list];
  return next.length > max ? next.slice(0, max) : next;
}

/** Удаляет запись по id. */
export function removeHistory(list: ReplayHistoryEntry[], id: string): ReplayHistoryEntry[] {
  return list.filter((e) => e.id !== id);
}

/**
 * Дублирует запись (копия спеки) сразу после оригинала. Отсутствующий id — no-op.
 * Кап `max` соблюдается (лишний хвост отбрасывается).
 */
export function duplicateHistory(
  list: ReplayHistoryEntry[],
  id: string,
  deps?: { id?: string; now?: number; max?: number },
): ReplayHistoryEntry[] {
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return list;
  const src = list[idx];
  if (src === undefined) return list;
  const copy = makeHistoryEntry(src.spec, src.status, {
    id: deps?.id ?? defaultId(),
    now: deps?.now ?? Date.now(),
  });
  const next = [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)];
  const max = deps?.max ?? MAX_HISTORY;
  return next.length > max ? next.slice(0, max) : next;
}

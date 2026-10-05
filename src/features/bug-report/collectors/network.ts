/**
 * Адаптер сетевой секции (TASK-025 ← TASK-022).
 *
 * Переиспользует лог мока сети как ЗАМОРОЖЕННЫЙ контракт: форма снимка берётся из
 * ГЛОБАЛЬНОГО контракта сообщения `mock/poll` (`@/shared/messaging/contract`), а не
 * из самой фичи мока — прямой импорт `@/features/mock-network/*` запрещён fitness
 * §12.1 (фичи не зависят друг от друга напрямую). Сам лог забирается тем же
 * `mock/poll` в `bridge.ts` (UI не дублирует сбор). Здесь — чистое отображение
 * снимка запросов в секцию артефакта; тестируется без DOM.
 *
 * Честная маркировка «недоступно»: если мок-фича не активна на вкладке (лог пуст /
 * `null`), `available:false` — секция в отчёте помечается «unavailable», а не
 * выдаёт пустоту за факт «сеть чистая».
 */
import type { ResponseOf } from '@/shared/messaging/contract';
import type { NetworkEntry, NetworkPart } from '../types';

/** Форма одной записи лога мока — через контракт `mock/poll`, без импорта фичи. */
export type CaughtRequestSnapshot = ResponseOf<'mock/poll'>['entries'][number];

/**
 * Строит сетевую секцию из снимка пойманных запросов. `null` (мок-фича не
 * опрашивалась) и пустой лог → `available:false`. Непустой лог → сводка + строки.
 */
export function toNetworkPart(entries: readonly CaughtRequestSnapshot[] | null): NetworkPart {
  if (entries === null || entries.length === 0) {
    return { available: false, total: 0, failed: 0, mocked: 0, entries: [] };
  }
  const mapped: NetworkEntry[] = entries.map((e) => ({
    method: e.method,
    url: e.url,
    status: e.status,
    mocked: e.mocked,
    source: e.source,
    durationMs: e.durationMs,
    error: e.error,
  }));
  const failed = mapped.filter((e) => e.error !== null || e.status === 0 || e.status >= 400).length;
  const mocked = mapped.filter((e) => e.mocked).length;
  return { available: true, total: mapped.length, failed, mocked, entries: mapped };
}

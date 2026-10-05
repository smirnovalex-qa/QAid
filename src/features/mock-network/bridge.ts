/**
 * Мост UI↔background для мока сети (TASK-022). Тонкие типобезопасные обёртки над
 * `sendMessage`: панель шлёт «сырые» правила, снимает перехват и опрашивает лог.
 * Транспорт/инъекция/компиляция — в background; здесь только нормализация `Result`
 * в удобные для UI значения (ошибки не бросаются наружу, кроме apply-отчёта).
 */
import { sendMessage } from '@/shared/messaging/bus';
import type { CaughtRequest, MockRule, ReplayResult, RequestSpec } from './types';

/** Включает перехват на вкладке с набором правил. Возвращает отчёт для UI. */
export async function applyMock(
  tabId: number,
  rules: MockRule[],
  strategy: 'main' | 'cdp',
): Promise<{ ok: boolean; reason?: string }> {
  const res = await sendMessage('mock/apply', { tabId, rules, strategy });
  if (!res.ok) return { ok: false, reason: 'transport' };
  return res.value.reason === undefined
    ? { ok: res.value.ok }
    : { ok: res.value.ok, reason: res.value.reason };
}

/** Снимает перехват с вкладки (best-effort). */
export async function clearMock(tabId: number): Promise<void> {
  await sendMessage('mock/clear', { tabId });
}

/**
 * Забирает снимок пойманных запросов вкладки + флаг активности транспорта (`active`).
 * При транспортной ошибке отдаём `active: true`, чтобы разовый сбой опроса не гасил
 * перехват спонтанно (реальное отсоединение CDP приходит как явный `active: false`).
 */
export async function pollMock(
  tabId: number,
): Promise<{ entries: CaughtRequest[]; active: boolean }> {
  const res = await sendMessage('mock/poll', { tabId });
  if (!res.ok) return { entries: [], active: true };
  return { entries: res.value.entries, active: res.value.active ?? true };
}

/**
 * Спрашивает фон, активен ли перехват на вкладке ПРЯМО СЕЙЧАС (источник истины для
 * переоткрытой панели: перехватчик живёт в странице и переживает закрытие popup).
 * Транспортный сбой → `active:false` — панель покажет «выкл» и не станет утверждать про
 * фоновый перехват, которого фон не подтвердил.
 */
export async function statusMock(
  tabId: number,
): Promise<{ active: boolean; strategy: 'main' | 'cdp' }> {
  const res = await sendMessage('mock/status', { tabId });
  if (!res.ok) return { active: false, strategy: 'main' };
  return { active: res.value.active, strategy: res.value.strategy };
}

/**
 * Переотправляет скомпонованный запрос через фон (TASK-038). Нормализует
 * транспортный сбой в `ReplayError` — наружу ничего не бросается (UI получает
 * дискриминируемый результат и рисует честную ошибку).
 */
export async function replayRequest(spec: RequestSpec): Promise<ReplayResult> {
  const res = await sendMessage('mock/replay', spec);
  if (!res.ok) return { ok: false, error: { kind: 'network', message: 'transport' } };
  return res.value;
}

/**
 * Локальные типы фичи «Snapshot-diff» (TASK-028) — только персистентное
 * состояние. Модель снимка и результата дифа живут отдельно (shared-слой и
 * `logic.ts`) — фича→shared, не наоборот (fitness §12.1).
 */
import type { DiffFilter } from './logic';

/**
 * Персистентное состояние фичи (namespace `snapshot-diff`, слой настроек
 * TASK-005). Пара снимков A/B держится в памяти сессии (не персистится — может
 * быть до ~10k узлов), а сохраняется лишь лёгкое предпочтение фильтра. Форма
 * оставлена расширяемой (сюда позже лягут именованные снимки).
 */
export interface SnapshotDiffSettingsState {
  /** Последний выбранный фильтр списка изменений. */
  readonly filter: DiffFilter;
}

export const SNAPSHOT_DIFF_SETTINGS_DEFAULTS: SnapshotDiffSettingsState = { filter: 'all' };

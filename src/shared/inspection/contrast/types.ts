/**
 * Общие типы фичи «Инспектор: контраст WCAG» (TASK-014).
 *
 * Вынесены отдельно, чтобы чистая логика (`logic.ts`), DOM-сборщик (`collector.ts`),
 * слой настроек и UI опирались на единый контракт, а не друг на друга. Все структуры
 * JSON-сериализуемы (пересекают границу сред content → side panel).
 */
import type { Rgba } from '@/shared/inspection/dom';

/** Уровень соответствия WCAG 2.1. */
export type WcagLevel = 'AA' | 'AAA';

/** Фильтр по типу текста: любой / обычный / крупный. */
export type TextTypeFilter = 'all' | 'normal' | 'large';

/**
 * Одна измеренная пара «текст/фон». Сериализуемая (цвета — plain `Rgba`, без DOM).
 * `ratio` уже вычислен сборщиком через `contrastRatio`; логика лишь классифицирует
 * число. `approximate` — честная пометка «оценено неточно» (градиент/картинка под
 * текстом), чтобы не давать ложно-зелёный результат.
 */
export interface ContrastSample {
  /** Короткий человекочитаемый селектор, напр. `p#lead.intro`. */
  readonly selector: string;
  /** Фрагмент текста узла (обрезан для отображения). */
  readonly text: string;
  /** Цвет текста (после композитинга полупрозрачности на фон). */
  readonly fg: Rgba;
  /** Эффективный фон под текстом. */
  readonly bg: Rgba;
  /** Коэффициент контраста 1..21 (WCAG 2.1). */
  readonly ratio: number;
  /** Крупный ли текст (≥24px или ≥18.66px&bold). */
  readonly large: boolean;
  /** Фон под текстом не оценён точно (градиент/картинка) — результат приближённый. */
  readonly approximate: boolean;
}

/** Сериализуемый агрегат страничного скана контраста. */
export interface ContrastScanData {
  /** Собранные пары «текст/фон». */
  readonly samples: readonly ContrastSample[];
  /** Сколько узлов посещено в пределах бюджета. */
  readonly visited: number;
  /** Бюджет узлов обхода. */
  readonly budget: number;
  /** Достигнут ли бюджет (результат усечён — «показано N из M»). */
  readonly truncated: boolean;
}

/** Персистентное состояние фичи (через слой настроек TASK-005). */
export interface ContrastSettingsState {
  readonly level: WcagLevel;
  readonly textType: TextTypeFilter;
  readonly onlyFails: boolean;
}

export const CONTRAST_SETTINGS_DEFAULTS: ContrastSettingsState = {
  level: 'AA',
  textType: 'all',
  onlyFails: false,
};

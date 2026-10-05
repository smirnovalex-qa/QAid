/**
 * Персистентные настройки откреплённой плавающей панели (TASK-062, namespace
 * `floating-panel`): положение, свёрнутость и ширина. Хранение — `chrome.storage.local`
 * через типизированный слой `defineFeatureSettings` (TASK-005), НЕ `localStorage`.
 *
 * Чистый `shared`-модуль: `chrome.*` не трогается на импорте (ленивый chrome-area
 * создаётся внутри `defineFeatureSettings` лишь при первом `.get()`/`.set()` в
 * content-реалме). PII не хранит — только геометрия окна.
 *
 * `x`/`y` nullable: `null` — «ещё не размещено пользователем» → обёртка вычисляет
 * дефолт (правый верхний угол с отступом, воспроизводит привычное место popup) из
 * актуального вьюпорта при первом монтаже. Ширина валидируется границами
 * {@link PANEL_MIN_WIDTH}…{@link PANEL_MAX_WIDTH} с `.catch` — повреждённое значение
 * мягко схлопывается к дефолту, а не роняет чтение.
 */
import { z } from 'zod';
import { defineFeatureSettings } from '@/shared/storage';
import type { FeatureSettings } from '@/shared/storage';
import { PANEL_DEFAULT_WIDTH, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from './protocol';

/** Сохранённое состояние окна панели. */
export interface FloatingPanelState {
  /** Смещение по X (px, `transform`). `null` — не размещено, вычислить дефолт. */
  x: number | null;
  /** Смещение по Y (px, `transform`). `null` — не размещено, вычислить дефолт. */
  y: number | null;
  /** Свёрнута ли панель в компактный заголовок-«таблетку». */
  collapsed: boolean;
  /** Ширина тела панели (px), в границах [min, max]. */
  width: number;
}

export const FLOATING_PANEL_DEFAULTS: FloatingPanelState = {
  x: null,
  y: null,
  collapsed: false,
  width: PANEL_DEFAULT_WIDTH,
};

/**
 * zod-схема состояния панели. Экспортируется (помимо связанного синглтона
 * {@link floatingPanelSettings}) для юнит-тестов на memory-area — чтобы проверять
 * клампы/дефолты без реального `chrome.storage`.
 */
export const floatingPanelSchema: z.ZodType<FloatingPanelState, z.ZodTypeDef, unknown> = z.object({
  x: z.number().finite().nullable().catch(null).default(null),
  y: z.number().finite().nullable().catch(null).default(null),
  collapsed: z.boolean().catch(false).default(false),
  width: z
    .number()
    .min(PANEL_MIN_WIDTH)
    .max(PANEL_MAX_WIDTH)
    .catch(PANEL_DEFAULT_WIDTH)
    .default(PANEL_DEFAULT_WIDTH),
});

export const floatingPanelSettings: FeatureSettings<FloatingPanelState> =
  defineFeatureSettings<FloatingPanelState>({
    namespace: 'floating-panel',
    schema: floatingPanelSchema,
    defaults: FLOATING_PANEL_DEFAULTS,
  });

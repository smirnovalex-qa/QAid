/**
 * Общие типы фичи «Инспектор: линейка / измеритель» (TASK-018).
 *
 * Вынесены отдельно, чтобы чистая геометрия (`logic.ts`), DOM-сборщик box-model
 * (`collector.ts`), слой настроек и UI опирались на единый контракт, а не друг на
 * друга. Все структуры JSON-сериализуемы (пересекают границу сред content → side
 * panel). Вся математика — на простых `Rect`, не на DOM-узлах (тестируемо без браузера).
 */

/**
 * Прямоугольник в клиентских координатах (сериализуемый снимок
 * `getBoundingClientRect`). Совпадает по форме с `ElementRect` инспекционного слоя.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Точка в клиентских координатах (конец свободной мерки, TASK-033). */
export interface Point {
  x: number;
  y: number;
}

/**
 * Результат свободного (drag) измерения между двумя точками A→B (TASK-033).
 *  - `dx`/`dy` — знаковое смещение (`b − a`);
 *  - `width`/`height` — модули смещения (габариты bbox мерки);
 *  - `length` — длина отрезка (гипотенуза);
 *  - `angleDeg` — угол вектора A→B в градусах (`atan2`, диапазон −180..180; 0 — вправо,
 *    положительный — вниз, т.к. ось Y экрана растёт вниз).
 * Все линейные величины округлены до 0.5px (правило `roundHalf`), угол — до 0.1°.
 */
export interface DragMeasurement {
  dx: number;
  dy: number;
  width: number;
  height: number;
  length: number;
  angleDeg: number;
}

/** Четыре стороны рамки (толщины padding/border/margin), CSS-px. */
export interface BoxSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Знаковые разницы соответствующих кромок двух прямоугольников (`b − a`).
 * Ноль означает совпадение кромки (выравнивание). Положительное — кромка B правее/ниже.
 */
export interface EdgeDeltas {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Флаги выравнивания кромок и центров (в пределах допуска округления). */
export interface AlignmentFlags {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
  centerX: boolean;
  centerY: boolean;
}

/**
 * Результат измерения между двумя прямоугольниками.
 *  - `gapX`/`gapY` — положительный зазор по оси (0, если проекции пересекаются);
 *  - `overlapX`/`overlapY` — длина пересечения проекций на ось (0, если зазор);
 *  - `edges` — знаковые разницы кромок (`b − a`);
 *  - `centerDelta` — смещение центра B относительно центра A;
 *  - `aligned` — какие кромки/центры совпали (в пределах допуска).
 */
export interface Measurement {
  gapX: number;
  gapY: number;
  overlapX: number;
  overlapY: number;
  edges: EdgeDeltas;
  centerDelta: { x: number; y: number };
  aligned: AlignmentFlags;
}

/**
 * Box-model выбранного элемента: рамка (border-box из `getBoundingClientRect`),
 * размер контент-бокса и толщины слоёв padding/border/margin по сторонам.
 * Контент представлен размерами (`width`/`height`), т.к. у контент-бокса нет
 * «толщин сторон» — в отличие от padding/border/margin.
 */
export interface BoxModel {
  /** Рамка элемента (border-box) в клиентских координатах. */
  rect: Rect;
  /** Размер контент-бокса (рамка минус padding и border). */
  content: { width: number; height: number };
  padding: BoxSides;
  border: BoxSides;
  margin: BoxSides;
}

/**
 * Режим измерения:
 *  - `ab` — зазор между двумя элементами (клики пикером);
 *  - `box` — box-model одного элемента;
 *  - `free` — свободная линейка: drag-мерка поверх страницы (TASK-033).
 */
export type RulerMode = 'ab' | 'box' | 'free';

/** Единицы отображения измерений. */
export type RulerUnits = 'px' | 'rem';

/** Персистентное состояние фичи (через слой настроек TASK-005). */
export interface RulerSettingsState {
  readonly mode: RulerMode;
  readonly units: RulerUnits;
  /** Порог примагничивания концов свободной мерки к кромкам элементов, px (TASK-033). */
  readonly snap: number;
  /** Включено ли примагничивание к кромкам в режиме свободной линейки (TASK-033). */
  readonly snapEnabled: boolean;
}

export const RULER_SETTINGS_DEFAULTS: RulerSettingsState = {
  mode: 'ab',
  units: 'px',
  snap: 4,
  snapEnabled: true,
};

/** Базовый размер корневого шрифта для перевода px↔rem (стандарт браузера). */
export const DEFAULT_ROOT_PX = 16;

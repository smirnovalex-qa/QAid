/**
 * Сериализуемые типы фичи «Скриншот с аннотациями» (TASK-027).
 *
 * Живут отдельно от `logic.ts`, чтобы UI/адаптер захвата тянули типы без
 * прохождения через инвариант чистоты `logic.ts`. Все структуры JSON-сериализуемы:
 * модель аннотаций персистится и переживает перерисовку canvas без потерь.
 *
 * Система координат аннотаций — пиксели захваченного изображения (device px, т.е.
 * с уже учтённым `devicePixelRatio`). Это тот же холст, что экспортируется в PNG,
 * поэтому пересчёт DPR при рендере/редакции не нужен: координаты редакции напрямую
 * индексируют пиксели.
 */

/** Режим захвата: видимая область / выбранный элемент / полная страница. */
export type CaptureMode = 'visible' | 'element' | 'full';

/** Инструмент разметки. `blur` — деструктивная замазка (приватность). */
export type AnnotationTool = 'rectangle' | 'arrow' | 'freehand' | 'text' | 'blur';

/** Точка в пиксельном пространстве изображения. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Прямоугольник (может иметь отрицательные размеры до нормализации). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Общие поля любой аннотации. */
interface BaseAnnotation {
  /** Стабильный id для React/undo-истории и адресации. */
  readonly id: string;
  /** Цвет обводки/текста (`#rrggbb`). */
  readonly color: string;
  /** Толщина линии в device px (для `blur` не используется). */
  readonly thickness: number;
}

export interface RectangleAnnotation extends BaseAnnotation {
  readonly kind: 'rectangle';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  readonly kind: 'arrow';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface FreehandAnnotation extends BaseAnnotation {
  readonly kind: 'freehand';
  readonly points: readonly Point[];
}

export interface TextAnnotation extends BaseAnnotation {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Кегль в device px. */
  readonly fontSize: number;
}

/** Замазка/редакция: применяется деструктивно к пикселям экспортируемого PNG. */
export interface BlurAnnotation extends BaseAnnotation {
  readonly kind: 'blur';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Дискриминированное объединение всех аннотаций. */
export type Annotation =
  RectangleAnnotation | ArrowAnnotation | FreehandAnnotation | TextAnnotation | BlurAnnotation;

/** Результат захвата: dataURL + размеры изображения в device px. */
export interface CaptureResult {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

/** Целочисленный прямоугольник кропа в device px. */
export interface PixelRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/** Один шаг склейки полной страницы (все величины — device px, кроме `scrollY`). */
export interface StitchStep {
  /** Куда проскроллить окно (CSS px). */
  readonly scrollY: number;
  /** Куда рисовать срез на итоговом холсте (device px). */
  readonly destYDevice: number;
  /** Смещение внутри снятого кадра, откуда брать срез (device px; ≠0 только на последнем шаге). */
  readonly sourceYDevice: number;
  /** Высота среза (device px). */
  readonly sliceHeightDevice: number;
}

/** План склейки полной страницы: размеры итогового холста + шаги. */
export interface StitchPlan {
  readonly width: number;
  readonly height: number;
  readonly steps: readonly StitchStep[];
}

/** Персистентные настройки фичи (namespace `screenshot`). */
export interface ScreenshotSettingsState {
  readonly mode: CaptureMode;
  readonly color: string;
  readonly thickness: number;
  readonly tool: AnnotationTool;
}

export const SCREENSHOT_SETTINGS_DEFAULTS: ScreenshotSettingsState = {
  mode: 'visible',
  color: '#e5484d',
  thickness: 4,
  tool: 'rectangle',
};

/**
 * Чистая логика фичи «Скриншот с аннотациями» (TASK-027): геометрия кропа по DPR,
 * план склейки полной страницы, нормализация/валидация модели аннотаций,
 * детерминированный рендер-план.
 *
 * Инвариант чистоты (fitness §12.1): без DOM/preact/@platform/chrome. Всё —
 * функции над числами/сериализуемыми структурами, тестируемые без браузера.
 *
 * Рендер-примитивы, общие для ДВУХ поверхностей редактора (side panel TASK-027 и
 * in-page оверлей TASK-035) — единый `switch` отрисовки `drawOverlay`, конвейер
 * `composePlan`, необратимая `pixelateRegion`, история undo/redo, имя файла — вынесены
 * в `@/shared/inspection/screenshot/draw` (инспекционный content-бандл не может
 * импортировать фичу, поэтому источник общий лежит в shared). Здесь они
 * РЕЭКСПОРТИРУЮТСЯ, чтобы потребители фичи и её тесты продолжали брать их из `./logic`.
 */
import type { Annotation, BlurAnnotation, Rect, PixelRect, StitchPlan, StitchStep } from './types';
import {
  arrowHead,
  arrowHeadSize,
  type OverlayOp,
  type Redaction,
  type RenderPlan,
} from '@/shared/inspection/screenshot/draw';

// Реэкспорт общих рендер-примитивов (единый источник — shared/draw): обратная
// совместимость для `ui.tsx`, `capture.ts` и `__tests__/logic.test.ts`, которые
// исторически берут их из `./logic`.
export {
  arrowHead,
  arrowHeadSize,
  drawOverlay,
  composePlan,
  pixelateRegion,
  redactionBlockSize,
  createHistory,
  commit,
  canUndo,
  canRedo,
  undo,
  redo,
  screenshotFileName,
} from '@/shared/inspection/screenshot/draw';
export type {
  OverlayOp,
  Redaction,
  ArrowHead,
  RenderPlan,
  History,
  Point as OverlayPoint,
} from '@/shared/inspection/screenshot/draw';

/** Минимальная/максимальная толщина линии (device px). */
export const MIN_THICKNESS = 1;
export const MAX_THICKNESS = 64;

/** Палитра быстрого выбора цвета (контрастные к типовым скриншотам). */
export const PALETTE: readonly string[] = [
  '#e5484d', // красный
  '#f76808', // оранжевый
  '#ffb224', // жёлтый
  '#30a46c', // зелёный
  '#0091ff', // синий
  '#8e4ec6', // фиолетовый
  '#111111', // чёрный
  '#ffffff', // белый
];

/** Строгая проверка `#rgb`/`#rrggbb`. */
export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** Зажимает толщину в допустимый диапазон и округляет к целому. */
export function clampThickness(value: number): number {
  if (Number.isNaN(value)) return MIN_THICKNESS;
  return Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, Math.round(value)));
}

/** Детерминированный id аннотации по порядковому номеру (без crypto — чистота). */
export function makeAnnotationId(seq: number): string {
  return `a${String(Math.trunc(seq))}`;
}

/** Нормализует прямоугольник к неотрицательным размерам (drag из любого угла). */
export function normalizeRect(rect: Rect): Rect {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return { x, y, width: Math.abs(rect.width), height: Math.abs(rect.height) };
}

/**
 * Переводит CSS-прямоугольник (координаты вьюпорта) в целочисленный кроп в device
 * px: нормализация → умножение на DPR → округление → отсечение отрицательных.
 */
export function cropRectToPixels(rect: Rect, dpr: number): PixelRect {
  const scale = dpr > 0 ? dpr : 1;
  const norm = normalizeRect(rect);
  const sx = Math.max(0, Math.round(norm.x * scale));
  const sy = Math.max(0, Math.round(norm.y * scale));
  const sw = Math.max(0, Math.round(norm.width * scale));
  const sh = Math.max(0, Math.round(norm.height * scale));
  return { sx, sy, sw, sh };
}

/** Зажимает кроп в границы изображения (кроп не выходит за пределы кадра). */
export function clampPixelRect(
  rect: PixelRect,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  const sx = Math.min(Math.max(0, rect.sx), imageWidth);
  const sy = Math.min(Math.max(0, rect.sy), imageHeight);
  const sw = Math.min(rect.sw, imageWidth - sx);
  const sh = Math.min(rect.sh, imageHeight - sy);
  return { sx, sy, sw: Math.max(0, sw), sh: Math.max(0, sh) };
}

/**
 * План склейки полной страницы. Идёт срезами по `viewportHeight` от верха: на
 * последнем шаге, если прокрутка упирается в `docHeight - viewportHeight`, берём
 * срез со смещением внутри кадра (`sourceYDevice`), чтобы не задваивать перекрытие.
 * Все выходные величины (кроме `scrollY`) — device px.
 */
export function planFullPageStitch(input: {
  docHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  dpr: number;
}): StitchPlan {
  const dpr = input.dpr > 0 ? input.dpr : 1;
  const docHeight = Math.max(0, input.docHeight);
  const viewportHeight = Math.max(1, input.viewportHeight);
  const viewportWidth = Math.max(0, input.viewportWidth);
  const maxScroll = Math.max(0, docHeight - viewportHeight);

  const steps: StitchStep[] = [];
  for (let destY = 0; destY < docHeight; destY += viewportHeight) {
    const sliceCss = Math.min(viewportHeight, docHeight - destY);
    const scrollY = Math.min(destY, maxScroll);
    const deltaCss = destY - scrollY; // ≥ 0, ненулевое только на последнем шаге
    steps.push({
      scrollY,
      destYDevice: Math.round(destY * dpr),
      sourceYDevice: Math.round(deltaCss * dpr),
      sliceHeightDevice: Math.round(sliceCss * dpr),
    });
  }
  // Пустой документ (docHeight 0) — один шаг на весь вьюпорт, чтобы вернуть кадр.
  if (steps.length === 0) {
    steps.push({ scrollY: 0, destYDevice: 0, sourceYDevice: 0, sliceHeightDevice: 0 });
  }

  return {
    width: Math.round(viewportWidth * dpr),
    height: Math.max(Math.round(docHeight * dpr), Math.round(viewportHeight * dpr)),
    steps,
  };
}

// ── модель аннотаций → рендер-план ────────────────────────────────────────────

function toRedaction(a: BlurAnnotation): Redaction {
  const norm = normalizeRect({ x: a.x, y: a.y, width: a.width, height: a.height });
  return {
    x: Math.round(norm.x),
    y: Math.round(norm.y),
    width: Math.round(norm.width),
    height: Math.round(norm.height),
  };
}

/** Строит детерминированный рендер-план из модели аннотаций. */
export function buildRenderPlan(annotations: readonly Annotation[]): RenderPlan {
  const redactions: Redaction[] = [];
  const overlays: OverlayOp[] = [];

  for (const a of annotations) {
    switch (a.kind) {
      case 'blur':
        redactions.push(toRedaction(a));
        break;
      case 'rectangle': {
        const norm = normalizeRect({ x: a.x, y: a.y, width: a.width, height: a.height });
        overlays.push({
          kind: 'rectangle',
          rect: {
            x: norm.x,
            y: norm.y,
            width: norm.width,
            height: norm.height,
          },
          color: a.color,
          thickness: a.thickness,
        });
        break;
      }
      case 'arrow':
        overlays.push({
          kind: 'arrow',
          x1: a.x1,
          y1: a.y1,
          x2: a.x2,
          y2: a.y2,
          head: arrowHead(a.x1, a.y1, a.x2, a.y2, arrowHeadSize(a.thickness)),
          color: a.color,
          thickness: a.thickness,
        });
        break;
      case 'freehand':
        overlays.push({
          kind: 'freehand',
          points: a.points,
          color: a.color,
          thickness: a.thickness,
        });
        break;
      case 'text':
        overlays.push({
          kind: 'text',
          x: a.x,
          y: a.y,
          text: a.text,
          color: a.color,
          fontSize: a.fontSize,
        });
        break;
    }
  }

  return { redactions, overlays };
}

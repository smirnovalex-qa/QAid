/**
 * Общий Preact-free рендер аннотаций скриншота — единый источник для ДВУХ поверхностей
 * редактора (TASK-027 side panel и TASK-035 in-page оверлей). Здесь живут:
 *
 *  - модель операций отрисовки (`OverlayOp`, `Redaction`, `RenderPlan`) и наконечник
 *    стрелки;
 *  - `drawOverlay` — единственный `switch (kind)` по видам оверлеев (рамка/стрелка/
 *    линия/текст): без него каждая поверхность копировала бы этот switch;
 *  - `composePlan` — конвейер сцены (кадр → деструктивная замазка зон → оверлеи);
 *  - `pixelateRegion` — необратимая пикселизация (приватность), юнит-проверяемая;
 *  - чистая история undo/redo и детерминированное имя файла экспорта.
 *
 * Живёт в `shared/inspection/screenshot` (а НЕ в `features/`), потому что попадает в
 * инспекционный content-бандл, который по фитнес-инварианту (§12, тест
 * `no file outside a feature imports a concrete feature`) не может импортировать
 * фичу. Feature-`logic.ts` реэкспортирует эти символы, сохраняя обратную
 * совместимость своих потребителей и тестов.
 *
 * Растровые функции принимают готовый `CanvasRenderingContext2D`/`CanvasImageSource`
 * и не трогают глобалы, поэтому остаются тестируемыми и не тянут DOM-окружение сверх
 * переданного контекста.
 */

/** Точка в пиксельном пространстве изображения (device px). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Нормализованная зона редакции (положительные целые, device px). */
export interface Redaction {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Геометрия наконечника стрелки (два «крыла» + остриё). */
export interface ArrowHead {
  readonly tip: Point;
  readonly left: Point;
  readonly right: Point;
}

/** Операция отрисовки поверх изображения (после редакции). */
export type OverlayOp =
  | {
      readonly kind: 'rectangle';
      readonly rect: Redaction;
      readonly color: string;
      readonly thickness: number;
    }
  | {
      readonly kind: 'arrow';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly head: ArrowHead;
      readonly color: string;
      readonly thickness: number;
    }
  | {
      readonly kind: 'freehand';
      readonly points: readonly Point[];
      readonly color: string;
      readonly thickness: number;
    }
  | {
      readonly kind: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly color: string;
      readonly fontSize: number;
    };

/**
 * Детерминированный рендер-план: сначала зоны редакции (применяются деструктивно к
 * пикселям), затем оверлеи в порядке добавления (алгоритм художника).
 */
export interface RenderPlan {
  readonly redactions: readonly Redaction[];
  readonly overlays: readonly OverlayOp[];
}

/** Наконечник стрелки: два крыла под углом `spread` от древка, длиной `size`. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): ArrowHead {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7; // ≈ 25.7°
  return {
    tip: { x: x2, y: y2 },
    left: { x: x2 - size * Math.cos(angle - spread), y: y2 - size * Math.sin(angle - spread) },
    right: { x: x2 - size * Math.cos(angle + spread), y: y2 - size * Math.sin(angle + spread) },
  };
}

/** Размер наконечника от толщины линии (с нижней границей для тонких линий). */
export function arrowHeadSize(thickness: number): number {
  return Math.max(12, thickness * 3.5);
}

/** Рисует один оверлей рендер-плана в контекст холста. */
export function drawOverlay(ctx: CanvasRenderingContext2D, op: OverlayOp): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (op.kind) {
    case 'rectangle':
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.thickness;
      ctx.strokeRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
      break;
    case 'arrow':
      ctx.strokeStyle = op.color;
      ctx.fillStyle = op.color;
      ctx.lineWidth = op.thickness;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(op.head.tip.x, op.head.tip.y);
      ctx.lineTo(op.head.left.x, op.head.left.y);
      ctx.lineTo(op.head.right.x, op.head.right.y);
      ctx.closePath();
      ctx.fill();
      break;
    case 'freehand': {
      const [first, ...rest] = op.points;
      if (first !== undefined) {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.thickness;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const p of rest) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      break;
    }
    case 'text':
      ctx.fillStyle = op.color;
      ctx.font = `${String(op.fontSize)}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(op.text, op.x, op.y);
      break;
  }
  ctx.restore();
}

/**
 * ДЕСТРУКТИВНО пикселизирует зону изображения (замазка = приватность): усредняет
 * цвет по блокам `blockSize×blockSize` и записывает среднее обратно в `pixels`
 * (RGBA, длина = width*height*4). Исходные пиксели зоны не восстановимы из
 * результата — гарантия необратимости в экспортируемом PNG. Мутирует буфер на месте.
 */
export function pixelateRegion(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  region: Redaction,
  blockSize: number,
): void {
  const block = Math.max(1, Math.trunc(blockSize));
  const x0 = Math.max(0, Math.trunc(region.x));
  const y0 = Math.max(0, Math.trunc(region.y));
  const x1 = Math.min(imageWidth, Math.trunc(region.x + region.width));
  const y1 = Math.min(imageHeight, Math.trunc(region.y + region.height));
  if (x1 <= x0 || y1 <= y0) return;

  for (let by = y0; by < y1; by += block) {
    for (let bx = x0; bx < x1; bx += block) {
      const bxEnd = Math.min(bx + block, x1);
      const byEnd = Math.min(by + block, y1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let y = by; y < byEnd; y += 1) {
        for (let x = bx; x < bxEnd; x += 1) {
          const i = (y * imageWidth + x) * 4;
          r += pixels[i] ?? 0;
          g += pixels[i + 1] ?? 0;
          b += pixels[i + 2] ?? 0;
          a += pixels[i + 3] ?? 0;
          count += 1;
        }
      }
      if (count === 0) continue;
      const ar = Math.round(r / count);
      const ag = Math.round(g / count);
      const ab = Math.round(b / count);
      const aa = Math.round(a / count);
      for (let y = by; y < byEnd; y += 1) {
        for (let x = bx; x < bxEnd; x += 1) {
          const i = (y * imageWidth + x) * 4;
          pixels[i] = ar;
          pixels[i + 1] = ag;
          pixels[i + 2] = ab;
          pixels[i + 3] = aa;
        }
      }
    }
  }
}

/** Размер блока пикселизации от размеров зоны (крупнее зона — крупнее блок). */
export function redactionBlockSize(region: Redaction): number {
  const shorter = Math.min(region.width, region.height);
  return Math.max(6, Math.round(shorter / 8));
}

/**
 * Компонует сцену в контекст: базовое изображение → деструктивная замазка зон
 * редакции по пикселям → оверлеи поверх. Единый конвейер для живого холста и
 * экспорта (WYSIWYG). Устойчив к отсутствию canvas-2d: вызывается только при наличии
 * контекста. Холст должен иметь размеры кадра (device px); координаты плана — в тех же
 * пикселях.
 */
export function composePlan(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  plan: RenderPlan,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  if (plan.redactions.length > 0) {
    const data = ctx.getImageData(0, 0, width, height);
    for (const region of plan.redactions) {
      pixelateRegion(data.data, width, height, region, redactionBlockSize(region));
    }
    ctx.putImageData(data, 0, 0);
  }
  for (const op of plan.overlays) drawOverlay(ctx, op);
}

// ── история undo/redo (чистая, неизменяемая) ─────────────────────────────────

/** Неизменяемая история состояний для undo/redo. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Фиксирует новое состояние: прошлое растёт, будущее сбрасывается. */
export function commit<T>(history: History<T>, next: T): History<T> {
  return { past: [...history.past, history.present], present: next, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** Откат на шаг назад (no-op, если нечего откатывать). */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Повтор шага вперёд (no-op, если нечего повторять). */
export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

// ── прочее ────────────────────────────────────────────────────────────────────

/** Двузначное дополнение нулём. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Детерминированное имя файла экспорта из режима и даты. */
export function screenshotFileName(mode: string, date: Date): string {
  const stamp =
    `${String(date.getFullYear())}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
  return `screenshot-${mode}-${stamp}.png`;
}

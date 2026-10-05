/**
 * Перетаскивание плавающей панели на Pointer Events (TASK-062, ADR-0053).
 *
 * Только Pointer Events + `setPointerCapture`: события доходят, даже когда курсор ушёл за
 * край окна/панели (mouse-события это теряют). `touch-action: none` на хэндле отключает
 * нативные жесты прокрутки. Позиционирование — через `transform` (callback `onMove`), без
 * layout-thrash. Мягкий clamp (на экране всегда остаётся хотя бы заголовок) — на стороне
 * вызывающего (`clamp`), применяется и в конце драга. На время драга вызывающий гасит
 * `pointer-events` iframe (`onStart`/`onEnd`), иначе курсор «проваливается» в iframe и drag
 * рвётся. `pointercancel`/потеря capture обрабатываются как штатное завершение (панель не
 * «прилипает» к курсору). Слушатели снимаются в `destroy` и по завершении драга — без утечек.
 */

/** Точка позиции панели (px, в координатах `transform`). */
export interface Point {
  x: number;
  y: number;
}

export interface DragOptions {
  /** Элемент-ручка (перетаскивание начинается с `pointerdown` на нём). */
  handle: HTMLElement;
  /** Текущая позиция панели (drag стартует от «живого» transform). */
  getPosition: () => Point;
  /** Привести желаемую позицию в допустимую (мягкий clamp по вьюпорту). */
  clamp: (x: number, y: number) => Point;
  /** Применить позицию (обычно — записать `transform`). */
  onMove: (x: number, y: number) => void;
  /** Начало драга (напр. погасить `pointer-events` iframe, поднять панель). */
  onStart?: () => void;
  /** Конец драга с итоговой позицией (напр. вернуть `pointer-events` iframe + persist). */
  onEnd?: (x: number, y: number) => void;
  /** Окно для слушателей move/up (по умолчанию — глобальный `window`). */
  win?: Window;
}

export interface DragController {
  /** Снять все слушатели и отвязать ручку. Идемпотентно. */
  destroy(): void;
  /** Идёт ли перетаскивание прямо сейчас (для тестов/диагностики). */
  readonly dragging: boolean;
}

/**
 * Включает перетаскивание панели за `handle`. Возвращает контроллер с `destroy()`.
 * Перетаскивание не начинается, если `pointerdown` пришёл на элемент с атрибутом
 * `data-no-drag` (кнопки свернуть/закрыть в заголовке) или не основной кнопкой мыши.
 */
export function enableDrag(options: DragOptions): DragController {
  const { handle, getPosition, clamp, onMove } = options;
  const win = options.win ?? window;

  handle.style.touchAction = 'none';
  handle.style.cursor = 'grab';

  let activePointerId: number | null = null;
  let startPointer: Point = { x: 0, y: 0 };
  let startPos: Point = { x: 0, y: 0 };
  let lastPos: Point = { x: 0, y: 0 };
  let destroyed = false;

  const onPointerMove = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    const dx = event.clientX - startPointer.x;
    const dy = event.clientY - startPointer.y;
    lastPos = clamp(startPos.x + dx, startPos.y + dy);
    onMove(lastPos.x, lastPos.y);
  };

  const finish = (): void => {
    if (activePointerId === null) return;
    const pointerId = activePointerId;
    activePointerId = null;
    win.removeEventListener('pointermove', onPointerMove, true);
    win.removeEventListener('pointerup', onPointerUp, true);
    win.removeEventListener('pointercancel', onPointerUp, true);
    // Отпускаем capture (если среда поддерживает и захват ещё держится).
    if (typeof handle.releasePointerCapture === 'function') {
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Capture мог уже сняться (pointercancel) — не критично.
      }
    }
    handle.style.cursor = 'grab';
    options.onEnd?.(lastPos.x, lastPos.y);
  };

  function onPointerUp(event: PointerEvent): void {
    if (activePointerId === null || event.pointerId !== activePointerId) return;
    finish();
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (destroyed || activePointerId !== null) return;
    // Основная кнопка (левая/касание/перо); правый клик/прочее — не драг.
    if (event.button !== 0) return;
    // Клик по кнопке заголовка (свернуть/закрыть) не начинает перетаскивание.
    const target = event.target;
    if (target instanceof Element && target.closest('[data-no-drag]')) return;

    event.preventDefault();
    activePointerId = event.pointerId;
    startPointer = { x: event.clientX, y: event.clientY };
    startPos = getPosition();
    lastPos = startPos;
    handle.style.cursor = 'grabbing';

    if (typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Среда без capture (jsdom) — слушатели на окне всё равно поймают move/up.
      }
    }
    win.addEventListener('pointermove', onPointerMove, true);
    win.addEventListener('pointerup', onPointerUp, true);
    win.addEventListener('pointercancel', onPointerUp, true);
    options.onStart?.();
  };

  handle.addEventListener('pointerdown', onPointerDown, true);

  return {
    destroy(): void {
      destroyed = true;
      finish();
      handle.removeEventListener('pointerdown', onPointerDown, true);
    },
    get dragging(): boolean {
      return activePointerId !== null;
    },
  };
}

/**
 * Мягкий clamp позиции панели во вьюпорт: по горизонтали на экране всегда остаётся не
 * меньше `minVisible` px панели, по вертикали — весь заголовок (верх хэндла не уходит выше
 * 0 и не ниже нижней кромки вьюпорта минус высота заголовка). Так панель нельзя утащить в
 * недостижимое место. Чистая функция — ядро для юнитов и reclamp на `resize`.
 */
export function clampPosition(
  x: number,
  y: number,
  size: { width: number; headerHeight: number },
  viewport: { width: number; height: number },
  minVisible = 48,
): Point {
  const maxX = viewport.width - minVisible;
  const minX = minVisible - size.width;
  const maxY = viewport.height - size.headerHeight;
  const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
  return {
    x: clamp(x, minX, maxX),
    // Верхняя граница 0 (заголовок не прячется над вьюпортом); нижняя — maxY (но не выше 0).
    y: clamp(y, 0, Math.max(0, maxY)),
  };
}

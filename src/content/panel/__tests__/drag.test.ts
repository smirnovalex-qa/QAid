import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampPosition, enableDrag } from '@/content/panel/drag';
import type { Point } from '@/content/panel/drag';

/** Синтетическое pointer-событие (jsdom без конструктора PointerEvent). */
function pointer(
  type: string,
  props: { clientX?: number; clientY?: number; button?: number; pointerId?: number } = {},
): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    clientX: props.clientX ?? 0,
    clientY: props.clientY ?? 0,
    button: props.button ?? 0,
    pointerId: props.pointerId ?? 1,
  });
  return e;
}

const identityClamp = (x: number, y: number): Point => ({ x, y });

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = '';
});

function setup(clamp = identityClamp) {
  const handle = document.createElement('div');
  const noDrag = document.createElement('button');
  noDrag.setAttribute('data-no-drag', '');
  handle.appendChild(noDrag);
  document.body.appendChild(handle);

  const moves: Point[] = [];
  const onStart = vi.fn();
  const onEnd = vi.fn<(x: number, y: number) => void>();
  const ctrl = enableDrag({
    handle,
    win: window,
    getPosition: () => ({ x: 10, y: 20 }),
    clamp,
    onMove: (x, y) => moves.push({ x, y }),
    onStart,
    onEnd,
  });
  cleanup = () => {
    ctrl.destroy();
  };
  return { handle, noDrag, moves, onStart, onEnd, ctrl };
}

describe('enableDrag', () => {
  it('pointerdown → move → up перемещает панель (transform-дельта) и зовёт start/end', () => {
    const { handle, moves, onStart, onEnd, ctrl } = setup();

    handle.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 50 }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(ctrl.dragging).toBe(true);

    window.dispatchEvent(pointer('pointermove', { clientX: 130, clientY: 70 }));
    // start (10,20) + delta (30,20) = (40,40)
    expect(moves.at(-1)).toEqual({ x: 40, y: 40 });

    window.dispatchEvent(pointer('pointerup', { clientX: 130, clientY: 70 }));
    expect(onEnd).toHaveBeenCalledWith(40, 40);
    expect(ctrl.dragging).toBe(false);
  });

  it('применяет мягкий clamp к позиции', () => {
    // clamp «прибивает» X к максимуму 25.
    const clamp = (x: number, y: number): Point => ({ x: Math.min(x, 25), y });
    const { handle, moves } = setup(clamp);
    handle.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    window.dispatchEvent(pointer('pointermove', { clientX: 500, clientY: 5 }));
    expect(moves.at(-1)).toEqual({ x: 25, y: 25 });
  });

  it('не начинает перетаскивание с кнопки заголовка (data-no-drag)', () => {
    const { noDrag, onStart, ctrl } = setup();
    noDrag.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 10 }));
    expect(onStart).not.toHaveBeenCalled();
    expect(ctrl.dragging).toBe(false);
  });

  it('игнорирует не основную кнопку мыши (правый клик)', () => {
    const { handle, onStart } = setup();
    handle.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, button: 2 }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('pointercancel завершает драг — панель не «прилипает» к курсору', () => {
    const { handle, onEnd, moves, ctrl } = setup();
    handle.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointer('pointermove', { clientX: 120, clientY: 120 }));
    window.dispatchEvent(pointer('pointercancel', { clientX: 120, clientY: 120 }));
    expect(ctrl.dragging).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // Дальнейшие move игнорируются (драг завершён).
    const count = moves.length;
    window.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 300 }));
    expect(moves.length).toBe(count);
  });

  it('destroy снимает слушатель pointerdown (повторный down — no-op)', () => {
    const { handle, onStart, ctrl } = setup();
    ctrl.destroy();
    handle.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('clampPosition', () => {
  const size = { width: 380, headerHeight: 40 };
  const vp = { width: 1000, height: 800 };

  it('держит часть панели (minVisible) на экране справа', () => {
    expect(clampPosition(5000, 100, size, vp).x).toBe(1000 - 48);
  });

  it('не даёт утащить панель целиком влево (видно minVisible)', () => {
    expect(clampPosition(-5000, 100, size, vp).x).toBe(48 - 380);
  });

  it('заголовок не уходит выше верхней кромки', () => {
    expect(clampPosition(100, -500, size, vp).y).toBe(0);
  });

  it('заголовок не уходит ниже нижней кромки (виден весь заголовок)', () => {
    expect(clampPosition(100, 5000, size, vp).y).toBe(800 - 40);
  });

  it('позицию внутри вьюпорта оставляет без изменений', () => {
    expect(clampPosition(120, 60, size, vp)).toEqual({ x: 120, y: 60 });
  });
});

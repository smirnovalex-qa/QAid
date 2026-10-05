/**
 * Тесты content-хоста управляемой прокрутки (TASK-027). Хендлеры тестируются
 * напрямую (без полного runtime): подменяем `window.scrollTo`/`scrollX/Y` и
 * читаем возвращаемые метрики.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screenshotScrollHandlers } from '@/shared/inspection/screenshot/scroll-host';

const { metrics, scrollStep, reset } = screenshotScrollHandlers;

function setScroll(x: number, y: number): void {
  Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

function setDpr(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  setScroll(0, 0);
  setDpr(1);
  // Хост держит базовую прокрутку в модульном состоянии — сбрасываем для изоляции.
  await reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('metrics', () => {
  it('returns numeric page metrics', async () => {
    const m = await metrics();
    expect(typeof m.viewportW).toBe('number');
    expect(typeof m.viewportH).toBe('number');
    expect(typeof m.docH).toBe('number');
    expect(m.dpr).toBe(1);
  });

  it('reflects a custom devicePixelRatio', async () => {
    setDpr(2);
    expect((await metrics()).dpr).toBe(2);
  });

  it('guards a non-positive devicePixelRatio to 1', async () => {
    setDpr(0);
    expect((await metrics()).dpr).toBe(1);
  });
});

describe('scrollStep', () => {
  it('scrolls the window and echoes the actual scrollY', async () => {
    setScroll(0, 640);
    const res = await scrollStep({ tabId: 1, scrollY: 640 });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 640);
    expect(res.scrollY).toBe(640);
    expect(typeof res.docH).toBe('number');
  });
});

describe('reset', () => {
  it('restores the scroll position captured before the run', async () => {
    setScroll(3, 111);
    await metrics(); // фиксирует базовую позицию (3, 111)
    setScroll(0, 999);
    await scrollStep({ tabId: 1, scrollY: 999 });

    vi.mocked(window.scrollTo).mockClear();
    const res = await reset();
    expect(res).toEqual({ ok: true });
    expect(window.scrollTo).toHaveBeenCalledWith(3, 111);
  });

  it('re-captures a fresh baseline after reset', async () => {
    setScroll(0, 50);
    await metrics(); // baseline (0, 50)
    await reset();
    // Новая серия: baseline пере-снимается на следующем metrics.
    setScroll(0, 200);
    await metrics();
    setScroll(0, 800);
    vi.mocked(window.scrollTo).mockClear();
    await reset();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 200);
  });
});

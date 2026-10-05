/**
 * Тесты интерактивной свободной линейки (TASK-033). Хендлеры тестируются напрямую
 * (без полного runtime): симулируем drag через события `document` в фазе перехвата.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { measureHandlers } from '@/content/inspection/measure-tool';

/** Диспатчит мышиное событие с клиентскими координатами в document (capture-фаза). */
function mouse(type: string, x: number, y: number): void {
  document.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
  );
}

/** Есть ли сейчас в документе хост оверлея линейки. */
function overlayCount(): number {
  return document.querySelectorAll('[data-qatb-overlay]').length;
}

afterEach(async () => {
  // Снимаем любую висящую сессию и чистим DOM/стили между тестами.
  await measureHandlers.measureStop();
  document.body.innerHTML = '';
  document.documentElement.style.cursor = '';
  document.documentElement.style.userSelect = '';
});

describe('measure (free-drag handler)', () => {
  const req = (snap = false) => ({ tabId: 1, snap, snapThreshold: 4 });

  it('resolves with endpoints and measurement after a drag', async () => {
    const pending = measureHandlers.measure(req());
    mouse('mousedown', 10, 20);
    expect(overlayCount()).toBe(1); // оверлей поднят на время drag
    mouse('mousemove', 40, 60);
    mouse('mouseup', 40, 60);

    const res = await pending;
    expect(res).not.toBeNull();
    expect(res?.a).toEqual({ x: 10, y: 20 });
    expect(res?.b).toEqual({ x: 40, y: 60 });
    expect(res?.measurement.length).toBe(50); // Δ(30,40) → 50
    expect(res?.measurement.angleDeg).toBe(53.1);
    expect(overlayCount()).toBe(0); // оверлей снят, слушатели восстановлены
    expect(document.documentElement.style.cursor).toBe('');
  });

  it('Esc cancels and resolves null (teardown complete)', async () => {
    const pending = measureHandlers.measure(req());
    mouse('mousedown', 5, 5);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(await pending).toBeNull();
    expect(overlayCount()).toBe(0);
  });

  it('measureStop cancels the active measure (resolves null)', async () => {
    const pending = measureHandlers.measure(req());
    mouse('mousedown', 5, 5);
    const stop = await measureHandlers.measureStop();
    expect(stop).toEqual({ ok: true });
    expect(await pending).toBeNull();
    expect(overlayCount()).toBe(0);
  });

  it('single-flight: a new measure evicts the previous (previous → null)', async () => {
    const first = measureHandlers.measure(req());
    const second = measureHandlers.measure(req());
    expect(await first).toBeNull(); // вытеснен
    expect(overlayCount()).toBe(1); // только оверлей второй сессии

    mouse('mousedown', 0, 0);
    mouse('mouseup', 100, 0);
    const res = await second;
    expect(res?.measurement.length).toBe(100);
    expect(res?.measurement.angleDeg).toBe(0);
  });

  it('after finish no stray listeners remain (a lone mousedown does nothing)', async () => {
    const pending = measureHandlers.measure(req());
    mouse('mousedown', 0, 0);
    mouse('mouseup', 10, 0);
    await pending;

    // Никакой активной сессии — событие не должно поднять оверлей.
    mouse('mousedown', 50, 50);
    expect(overlayCount()).toBe(0);
  });

  it('snap:true collects edges without crashing (no-op in jsdom zero-rect layout)', async () => {
    document.body.innerHTML = '<div>a</div><section>b</section>';
    const pending = measureHandlers.measure(req(true));
    mouse('mousedown', 12, 34);
    mouse('mouseup', 12, 34);
    const res = await pending;
    expect(res?.measurement.length).toBe(0);
  });
});

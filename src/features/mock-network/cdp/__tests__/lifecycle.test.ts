import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createCdpLifecycle } from '../lifecycle';
import type { CdpLifecycleDeps, CdpStatus } from '../lifecycle';
import type { CdpFetchProcessor } from '../transport';
import type { DebuggerEventListener, DebuggerDetachListener } from '@/platform';
import type { CompiledRule } from '../../types';

/** Захватывает подписанные слушатели seam/вкладок, чтобы дёргать их из теста. */
interface Harness {
  deps: CdpLifecycleDeps;
  seam: {
    attach: Mock;
    detach: Mock;
    sendCommand: Mock;
  };
  processors: Map<number, FakeProcessor>;
  statuses: { tabId: number; status: CdpStatus; reason?: string }[];
  fireEvent: DebuggerEventListener;
  fireDetach: DebuggerDetachListener;
  fireRemoved: (tabId: number) => void;
  /** Позволяет тесту заставить enable() падать для следующей создаваемой сессии. */
  failEnable: boolean;
}

interface FakeProcessor extends CdpFetchProcessor {
  updateRules: Mock;
  enable: Mock;
  handleEvent: Mock;
  readLog: Mock;
  reset: Mock;
}

const RULES: CompiledRule[] = [];

function makeHarness(): Harness {
  let eventCb: DebuggerEventListener = () => undefined;
  let detachCb: DebuggerDetachListener = () => undefined;
  let removedCb: (tabId: number) => void = () => undefined;

  const seam = {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue({}),
    onEvent: {
      addListener: (cb: DebuggerEventListener): void => {
        eventCb = cb;
      },
      removeListener: vi.fn(),
    },
    onDetach: {
      addListener: (cb: DebuggerDetachListener): void => {
        detachCb = cb;
      },
      removeListener: vi.fn(),
    },
  };

  const tabEvents = {
    onRemoved: {
      addListener: (cb: (tabId: number) => void): void => {
        removedCb = cb;
      },
    },
  };

  const processors = new Map<number, FakeProcessor>();
  const statuses: { tabId: number; status: CdpStatus; reason?: string }[] = [];

  const harness: Harness = {
    seam,
    processors,
    statuses,
    failEnable: false,
    get fireEvent() {
      return eventCb;
    },
    get fireDetach() {
      return detachCb;
    },
    get fireRemoved() {
      return removedCb;
    },
    deps: {
      seam,
      tabEvents,
      onStatusChange: (tabId, status, reason) => {
        statuses.push({ tabId, status, ...(reason !== undefined ? { reason } : {}) });
      },
      createProcessor: (tabId: number): FakeProcessor => {
        const proc: FakeProcessor = {
          updateRules: vi.fn(),
          enable: vi.fn(() =>
            harness.failEnable ? Promise.reject(new Error('enable boom')) : Promise.resolve(),
          ),
          handleEvent: vi.fn(),
          readLog: vi.fn().mockReturnValue([]),
          reset: vi.fn(),
        };
        processors.set(tabId, proc);
        return proc;
      },
    },
  };
  return harness;
}

describe('createCdpLifecycle', () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  it('attach подключает отладчик, включает перехват и помечает активной', async () => {
    const lc = createCdpLifecycle(h.deps);
    const res = await lc.attach(3, RULES);

    expect(res).toEqual({ ok: true });
    expect(h.seam.attach).toHaveBeenCalledWith(3);
    expect(h.processors.get(3)?.enable).toHaveBeenCalled();
    expect(h.processors.get(3)?.updateRules).toHaveBeenCalledWith(RULES);
    expect(lc.isActive(3)).toBe(true);
    expect(h.statuses).toContainEqual({ tabId: 3, status: 'attached', reason: undefined });
  });

  it('повторный attach на ту же вкладку не делает второй attach — только обновляет правила', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.attach(3, RULES);
    const next: CompiledRule[] = [];
    const res = await lc.attach(3, next);

    expect(res).toEqual({ ok: true });
    expect(h.seam.attach).toHaveBeenCalledTimes(1);
    expect(h.processors.get(3)?.updateRules).toHaveBeenCalledWith(next);
  });

  it('ошибка attach → ok:false, сессия не активна', async () => {
    h.seam.attach.mockRejectedValueOnce(new Error('attach boom'));
    const lc = createCdpLifecycle(h.deps);
    const res = await lc.attach(3, RULES);

    expect(res).toEqual({ ok: false, reason: 'attach-failed' });
    expect(lc.isActive(3)).toBe(false);
  });

  it('ошибка enable → гарантированно detach, сессия снята', async () => {
    h.failEnable = true;
    const lc = createCdpLifecycle(h.deps);
    const res = await lc.attach(3, RULES);

    expect(res).toEqual({ ok: false, reason: 'enable-failed' });
    expect(h.seam.detach).toHaveBeenCalledWith(3);
    expect(lc.isActive(3)).toBe(false);
  });

  it('detach снимает отладчик и сбрасывает процессор', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.attach(3, RULES);
    const proc = h.processors.get(3);
    await lc.detach(3);

    expect(h.seam.detach).toHaveBeenCalledWith(3);
    expect(proc?.reset).toHaveBeenCalled();
    expect(lc.isActive(3)).toBe(false);
    expect(h.statuses).toContainEqual({ tabId: 3, status: 'detached', reason: undefined });
  });

  it('detach неактивной вкладки — no-op', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.detach(42);
    expect(h.seam.detach).not.toHaveBeenCalled();
  });

  it('ручной onDetach (пользователь закрыл баннер) чистит сессию БЕЗ повторного seam.detach', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.attach(3, RULES);
    h.seam.detach.mockClear();

    h.fireDetach({ tabId: 3 }, 'target_closed');

    expect(lc.isActive(3)).toBe(false);
    expect(h.seam.detach).not.toHaveBeenCalled(); // браузер уже отсоединился
    expect(h.statuses).toContainEqual({ tabId: 3, status: 'detached', reason: 'target_closed' });
  });

  it('закрытие вкладки (onRemoved) освобождает отладчик', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.attach(3, RULES);
    h.seam.detach.mockClear();

    h.fireRemoved(3);
    await Promise.resolve();

    expect(h.seam.detach).toHaveBeenCalledWith(3);
    expect(lc.isActive(3)).toBe(false);
  });

  it('события отладчика роутятся процессору нужной вкладки', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.attach(3, RULES);
    const proc = h.processors.get(3);

    h.fireEvent({ tabId: 3 }, 'Fetch.requestPaused', { requestId: 'x' });
    expect(proc?.handleEvent).toHaveBeenCalledWith({ tabId: 3 }, 'Fetch.requestPaused', {
      requestId: 'x',
    });

    // Событие неизвестной вкладки не роняет и никуда не роутится.
    expect(() => {
      h.fireEvent({ tabId: 999 }, 'Fetch.requestPaused', {});
    }).not.toThrow();
  });

  it('readLog делегирует процессору активной сессии (иначе пусто)', async () => {
    const lc = createCdpLifecycle(h.deps);
    await lc.attach(3, RULES);
    h.processors.get(3)?.readLog.mockReturnValue([{ id: 1 }]);

    expect(lc.readLog(3)).toEqual([{ id: 1 }]);
    expect(lc.readLog(77)).toEqual([]);
  });
});

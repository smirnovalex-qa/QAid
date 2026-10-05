/**
 * Тесты общего потока осмотра узла `useInspectedNode` (TASK-052 · TASK-056) на фейковой
 * шине. Ключевой периметр — ЖИВОЙ режим (`pickLive`-цикл): пере-вооружение после каждого
 * клика, выход по `null` с сохранением узла, `stopLive`/`cancel`, обратная подсветка
 * `highlightTarget`. Заодно smoke одноразового `pick` (совместимость). Цикл асинхронный,
 * поэтому `inspection/pickLive` резолвится управляемыми deferred'ами шаг за шагом.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, render } from '@testing-library/preact';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';
import type { NavigationState, NodeDescriptor } from '@/shared/inspection/types';

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return { ...actual, tabs: { ...actual.tabs, queryActive: () => Promise.resolve(1) } };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return { ...actual, createPermissionBroker: () => ({ ensure: () => Promise.resolve(true) }) };
});

import { sendMessage } from '@/shared/messaging/bus';
import { useInspectedNode } from '../useInspectedNode';
import type { UseInspectedNodeOptions, UseInspectedNodeResult } from '../useInspectedNode';

const mockedSend = sendMessage as unknown as Mock;

/** Управляемое обещание — резолвим `inspection/pickLive` по шагам из теста. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Дренаж микрозадач через макротик (внутри `act`, как в остальных preact-тестах). */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function node(tag: string, selector: string, extra: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return {
    tagName: tag,
    id: null,
    classNames: [],
    selector,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    childElementCount: 1,
    siblingIndex: 0,
    siblingCount: 1,
    depth: 3,
    ...extra,
  };
}

const leaf = node('span', 'span#leaf', { childElementCount: 0, depth: 3 });
const parent = node('div', 'div#wrap', { childElementCount: 1, depth: 2 });

const leafState: NavigationState = {
  node: leaf,
  path: [node('html', 'html', { depth: 0 }), node('body', 'body', { depth: 1 }), parent, leaf],
  canAscend: true,
  canDescend: false,
};
const parentState: NavigationState = {
  node: parent,
  path: [node('html', 'html', { depth: 0 }), node('body', 'body', { depth: 1 }), parent],
  canAscend: true,
  canDescend: true,
};

/** Очередь deferred'ов активных `inspection/pickLive` (цикл вооружает по одному). */
let pickLiveQueue: Deferred<unknown>[] = [];

/**
 * Захват последнего результата хука: probe-компонент перезаписывает `latest` на каждый
 * рендер (renderHook в репозитории не используется — рендерим крошечный зонд).
 */
let latest: UseInspectedNodeResult<unknown>;
function Probe({ options }: { options: UseInspectedNodeOptions<unknown> }): null {
  latest = useInspectedNode(options);
  return null;
}

function renderHook(options: UseInspectedNodeOptions<unknown> = {}): void {
  render(<Probe options={options} />);
}

/** Резолвит очередной ожидающий `pickLive` и прогоняет продолжение цикла. */
async function resolvePickLive(value: unknown): Promise<void> {
  const d = pickLiveQueue.shift();
  expect(d).toBeDefined();
  await act(async () => {
    d?.resolve(value);
    await flush();
  });
}

beforeEach(() => {
  pickLiveQueue = [];
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/pickLive') {
      const d = deferred<unknown>();
      pickLiveQueue.push(d);
      return d.promise;
    }
    if (type === 'inspection/pick') {
      return Promise.resolve({ ok: true, value: { ...leaf, navigation: leafState } });
    }
    if (type === 'inspection/collect') {
      return Promise.resolve({
        ok: true,
        value: { inspectorId: 'contrast', data: { ratio: 4.5 } },
      });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
});

/** Запускает живой pick и доводит до состояния «сессия ждёт первый клик». */
async function armLive(options: UseInspectedNodeOptions<unknown> = { live: true }): Promise<void> {
  renderHook(options);
  await act(async () => {
    latest.pick();
    await flush();
  });
}

describe('useInspectedNode — живой режим (TASK-056)', () => {
  it('вооружает live-сессию и ждёт клик (live=true, busy=false, один pickLive в полёте)', async () => {
    await armLive();
    expect(latest.live).toBe(true);
    expect(latest.busy).toBe(false);
    expect(latest.state).toBeNull();
    expect(mockedSend).toHaveBeenCalledWith('inspection/pickLive', { tabId: 1 });
    expect(pickLiveQueue).toHaveLength(1);
  });

  it('клик по странице ставит узел, зовёт collect, и цикл пере-вооружается на следующий', async () => {
    await armLive({ live: true, inspectorId: 'contrast' });

    // Первый клик → лист.
    await resolvePickLive({ ok: true, value: { ...leaf, navigation: leafState } });
    expect(latest.state).toEqual(leafState);
    expect(latest.data).toEqual({ ratio: 4.5 });
    expect(latest.live).toBe(true);
    expect(mockedSend).toHaveBeenCalledWith('inspection/collect', {
      tabId: 1,
      inspectorId: 'contrast',
    });
    // Цикл пере-вооружился — снова ждёт клик.
    expect(pickLiveQueue).toHaveLength(1);

    // Второй клик → более глубокий/другой узел, состояние обновляется снова.
    await resolvePickLive({ ok: true, value: { ...parent, navigation: parentState } });
    expect(latest.state).toEqual(parentState);
    expect(latest.live).toBe(true);
    expect(pickLiveQueue).toHaveLength(1);
  });

  it('pickLive === null выходит из режима, СОХРАНЯЯ state/data, live=false', async () => {
    await armLive({ live: true, inspectorId: 'contrast' });
    await resolvePickLive({ ok: true, value: { ...leaf, navigation: leafState } });
    expect(latest.state).toEqual(leafState);

    await resolvePickLive({ ok: true, value: null });
    expect(latest.live).toBe(false);
    expect(latest.busy).toBe(false);
    // Узел и данные сохранены — панель держит последний осмотренный элемент.
    expect(latest.state).toEqual(leafState);
    expect(latest.data).toEqual({ ratio: 4.5 });
  });

  it('stopLive шлёт pickLiveStop и гасит live, СОХРАНЯЯ state', async () => {
    await armLive({ live: true });
    await resolvePickLive({ ok: true, value: { ...leaf, navigation: leafState } });
    expect(latest.state).toEqual(leafState);

    await act(async () => {
      latest.stopLive();
      await flush();
    });
    expect(latest.live).toBe(false);
    expect(latest.state).toEqual(leafState); // узел сохранён (Esc-в-live)
    expect(mockedSend).toHaveBeenCalledWith('inspection/pickLiveStop', { tabId: 1 });
  });

  it('cancel шлёт pickLiveStop и teardown, и ОЧИЩАЕТ state', async () => {
    await armLive({ live: true });
    await resolvePickLive({ ok: true, value: { ...leaf, navigation: leafState } });
    expect(latest.state).toEqual(leafState);

    await act(async () => {
      latest.cancel();
      await flush();
    });
    expect(latest.live).toBe(false);
    expect(latest.state).toBeNull();
    expect(mockedSend).toHaveBeenCalledWith('inspection/pickLiveStop', { tabId: 1 });
    expect(mockedSend).toHaveBeenCalledWith('inspection/teardown', { tabId: 1 });
  });

  it('highlightTarget шлёт inspection/highlight с активной вкладкой', async () => {
    await armLive({ live: true });
    await act(async () => {
      latest.highlightTarget('div#wrap');
      await flush();
    });
    expect(mockedSend).toHaveBeenCalledWith('inspection/highlight', {
      tabId: 1,
      selector: 'div#wrap',
    });
  });

  it('highlightTarget — no-op без активной вкладки (до pick)', async () => {
    renderHook({ live: true });
    await act(async () => {
      latest.highlightTarget('div#wrap');
      await flush();
    });
    expect(mockedSend).not.toHaveBeenCalledWith('inspection/highlight', expect.anything());
  });
});

describe('useInspectedNode — одноразовый pick (совместимость)', () => {
  it('не-live pick остаётся одноразовым: ставит state без pickLive-цикла', async () => {
    renderHook({ inspectorId: 'contrast' });
    await act(async () => {
      latest.pick();
      await flush();
    });
    expect(latest.state).toEqual(leafState);
    expect(latest.live).toBe(false);
    expect(mockedSend).toHaveBeenCalledWith('inspection/pick', { tabId: 1 });
    expect(mockedSend).not.toHaveBeenCalledWith('inspection/pickLive', expect.anything());
    expect(pickLiveQueue).toHaveLength(0);
  });
});

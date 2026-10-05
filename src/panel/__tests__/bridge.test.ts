import { describe, expect, it, vi } from 'vitest';
import { initPanelBridge } from '@/panel/bridge';
import { FromPanelSchema, decodePanelMessage, encodePanelMessage } from '@/shared/panel/protocol';
import type { ToPanelMessage } from '@/shared/panel/protocol';

interface FakeWin {
  location: { hash: string };
  parent: unknown;
  addEventListener: (t: string, cb: (e: MessageEvent) => void) => void;
  removeEventListener: (t: string, cb: (e: MessageEvent) => void) => void;
  emit: (t: string, e: MessageEvent) => void;
  listenerCount: () => number;
}

function fakeWin(
  hash: string,
  standalone = false,
): { win: FakeWin; parentPost: ReturnType<typeof vi.fn> } {
  const listeners: ((e: MessageEvent) => void)[] = [];
  const parentPost = vi.fn();
  const win: FakeWin = {
    location: { hash },
    parent: null,
    addEventListener: (_t, cb) => listeners.push(cb),
    removeEventListener: (_t, cb) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
    emit: (_t, e) => {
      for (const cb of listeners.slice()) cb(e);
    },
    listenerCount: () => listeners.length,
  };
  win.parent = standalone ? win : { postMessage: parentPost };
  return { win, parentPost };
}

const NONCE = 'iframe-nonce-1';

describe('initPanelBridge', () => {
  it('на старте шлёт обёртке `ready` с nonce из hash', () => {
    const { win, parentPost } = fakeWin(`#${NONCE}`);
    const bridge = initPanelBridge(win as unknown as Window);
    expect(bridge.nonce).toBe(NONCE);
    expect(parentPost).toHaveBeenCalledTimes(1);
    const [wire] = parentPost.mock.calls[0] as [unknown, string];
    expect(decodePanelMessage(wire, NONCE, FromPanelSchema)).toEqual({ type: 'ready' });
  });

  it('методы постят collapse/expand/close/resize с nonce', () => {
    const { win, parentPost } = fakeWin(`#${NONCE}`);
    const bridge = initPanelBridge(win as unknown as Window);
    parentPost.mockClear();
    bridge.collapse();
    bridge.resize({ width: 420 });
    bridge.close();
    const decoded = parentPost.mock.calls.map(([wire]) =>
      decodePanelMessage(wire, NONCE, FromPanelSchema),
    );
    expect(decoded).toEqual([
      { type: 'collapse' },
      { type: 'resize', width: 420 },
      { type: 'close' },
    ]);
  });

  it('onState получает `state` от обёртки (верный nonce + источник=parent)', () => {
    const { win } = fakeWin(`#${NONCE}`);
    const bridge = initPanelBridge(win as unknown as Window);
    const seen: ToPanelMessage[] = [];
    bridge.onState((s) => seen.push(s));
    win.emit('message', {
      source: win.parent,
      data: encodePanelMessage(NONCE, { type: 'state', collapsed: true, width: 400 }),
    } as unknown as MessageEvent);
    expect(seen).toEqual([{ type: 'state', collapsed: true, width: 400 }]);
  });

  it('игнорирует `state` с чужим nonce', () => {
    const { win } = fakeWin(`#${NONCE}`);
    const bridge = initPanelBridge(win as unknown as Window);
    const seen: ToPanelMessage[] = [];
    bridge.onState((s) => seen.push(s));
    win.emit('message', {
      source: win.parent,
      data: encodePanelMessage('other', { type: 'state', collapsed: false, width: 380 }),
    } as unknown as MessageEvent);
    expect(seen).toHaveLength(0);
  });

  it('без nonce (открыта напрямую) мост инертен — ничего не шлёт и не слушает', () => {
    const { win, parentPost } = fakeWin('', true);
    const bridge = initPanelBridge(win as unknown as Window);
    expect(bridge.nonce).toBeNull();
    expect(parentPost).not.toHaveBeenCalled();
    expect(win.listenerCount()).toBe(0);
  });

  it('destroy снимает слушатель', () => {
    const { win } = fakeWin(`#${NONCE}`);
    const bridge = initPanelBridge(win as unknown as Window);
    expect(win.listenerCount()).toBe(1);
    bridge.destroy();
    expect(win.listenerCount()).toBe(0);
  });
});

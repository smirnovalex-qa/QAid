import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabRemovedListener } from '@/platform';

// Платформенный seam мокаем — проверяем контроллер вкладки без реального `chrome.*`.
const createMock = vi.hoisted(() => vi.fn((): Promise<number | undefined> => Promise.resolve(7)));
const removeMock = vi.hoisted(() => vi.fn((): Promise<void> => Promise.resolve()));
const addListenerMock = vi.hoisted(() => vi.fn());
const removeListenerMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform', () => ({
  runtime: { getURL: (p: string): string => `chrome-extension://id/${p}` },
  tabs: {
    create: createMock,
    remove: removeMock,
  },
  tabEvents: {
    onRemoved: {
      addListener: addListenerMock,
      removeListener: removeListenerMock,
    },
  },
}));

import {
  RECORDER_TAB_PATH,
  recorderTabQuery,
  parseRecorderTabParams,
} from '@/features/screen-recording/recorder-tab/params';
import { openRecorderTab } from '@/features/screen-recording/recorder-tab/controller';

beforeEach(() => {
  createMock.mockReset().mockResolvedValue(7);
  removeMock.mockReset().mockResolvedValue(undefined);
  addListenerMock.mockReset();
  removeListenerMock.mockReset();
});

describe('recorder-tab params', () => {
  it('round-trips session params through the query string', () => {
    const q = recorderTabQuery({ systemAudio: true, mic: false, maxDurationMs: 90_000 });
    expect(q).toBe('sys=1&mic=0&max=90000');
    expect(parseRecorderTabParams(`?${q}`)).toEqual({
      systemAudio: true,
      mic: false,
      maxDurationMs: 90_000,
    });
  });

  it('falls back to a safe default when max is missing or invalid', () => {
    expect(parseRecorderTabParams('?sys=0&mic=1').maxDurationMs).toBe(300_000);
    expect(parseRecorderTabParams('?sys=0&mic=1&max=-5').maxDurationMs).toBe(300_000);
  });
});

describe('openRecorderTab', () => {
  it('opens a tab at the recorder page with the session query', async () => {
    await openRecorderTab({ systemAudio: true, mic: true, maxDurationMs: 60_000 });
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = (createMock.mock.calls[0] as unknown as [{ url: string; active?: boolean }])[0];
    expect(arg.url).toContain(RECORDER_TAB_PATH);
    expect(arg.url).toContain('mic=1');
    expect(arg.active).toBe(true);
  });

  it('notifies onClosed only when the user closes THIS tab', async () => {
    const handle = await openRecorderTab({ systemAudio: false, mic: true, maxDurationMs: 60_000 });
    const onClosed = vi.fn();
    handle.onClosed(onClosed);

    const listener = addListenerMock.mock.calls[0]?.[0] as TabRemovedListener;
    listener(999, { windowId: 1, isWindowClosing: false }); // чужая вкладка — игнор
    expect(onClosed).not.toHaveBeenCalled();
    listener(7, { windowId: 1, isWindowClosing: false }); // наша вкладка
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('close() removes the tab and detaches the listener; later removals are ignored', async () => {
    const handle = await openRecorderTab({ systemAudio: false, mic: true, maxDurationMs: 60_000 });
    const onClosed = vi.fn();
    handle.onClosed(onClosed);

    await handle.close();
    expect(removeMock).toHaveBeenCalledWith(7);
    expect(removeListenerMock).toHaveBeenCalledTimes(1);

    const listener = addListenerMock.mock.calls[0]?.[0] as TabRemovedListener;
    listener(7, { windowId: 1, isWindowClosing: false });
    expect(onClosed).not.toHaveBeenCalled(); // close() уже пометил вкладку закрытой
  });
});

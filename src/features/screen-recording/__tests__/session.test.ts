import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Оркестратор сессии тестируем в изоляции: поток и рекордер — заглушки, чтобы проверить
// именно последовательность событий и очистку, а не DOM/`MediaRecorder` (их нет в jsdom).
const buildStreamMock = vi.hoisted(() => vi.fn());
const startRecorderMock = vi.hoisted(() => vi.fn());
vi.mock('@/features/screen-recording/capture', () => ({ buildRecordingStream: buildStreamMock }));
vi.mock('@/features/screen-recording/recorder', () => ({ startRecorder: startRecorderMock }));

import { createRecordingSession } from '@/features/screen-recording/session';
import type { RecorderEvent } from '@/features/screen-recording/types';
import type { RecorderCallbacks, RecorderHandle } from '@/features/screen-recording/recorder';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface FakeBuilt {
  stop: ReturnType<typeof vi.fn>;
  stream: MediaStream;
  videoTrack: { addEventListener: ReturnType<typeof vi.fn> };
}

function fakeBuilt(): FakeBuilt {
  const videoTrack = { addEventListener: vi.fn() };
  return {
    stop: vi.fn(),
    stream: { getVideoTracks: () => [videoTrack] } as unknown as MediaStream,
    videoTrack,
  };
}

let capturedCb: RecorderCallbacks | null = null;
const handle: RecorderHandle = { stop: vi.fn(), pause: vi.fn(), resume: vi.fn() };

beforeEach(() => {
  capturedCb = null;
  buildStreamMock.mockReset();
  startRecorderMock.mockReset().mockImplementation((_s, _m, _t, cb: RecorderCallbacks) => {
    capturedCb = cb;
    return handle;
  });
  // `pickMimeType` спрашивает `MediaRecorder.isTypeSupported` — в jsdom его нет.
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = {
    isTypeSupported: (): boolean => true,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('createRecordingSession', () => {
  it('start: emits requesting → recording and wires the native "Stop sharing" handler', async () => {
    const built = fakeBuilt();
    buildStreamMock.mockResolvedValue(built);
    const events: RecorderEvent[] = [];

    const session = createRecordingSession((e) => events.push(e));
    session.start({ systemAudio: true, mic: true, maxDurationMs: 60_000 });
    await flush();

    const states = events
      .filter((e) => e.evt === 'state')
      .map((e) => (e as { state: string }).state);
    expect(states).toContain('requesting');
    expect(states).toContain('recording');
    // Нативный «Stop sharing» слушается на видеотреке.
    expect(built.videoTrack.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));

    // Останавливаем, чтобы не оставить активных таймеров прогресса/лимита.
    session.stop();
    capturedCb?.onStop(new Blob(['x']));
  });

  it('stop: finalizes, emits the blob + ready and releases the source tracks', async () => {
    const built = fakeBuilt();
    buildStreamMock.mockResolvedValue(built);
    const events: RecorderEvent[] = [];

    const session = createRecordingSession((e) => events.push(e));
    session.start({ systemAudio: false, mic: true, maxDurationMs: 60_000 });
    await flush();

    session.stop();
    expect(handle.stop).toHaveBeenCalledTimes(1);
    // `MediaRecorder` завершился — эмулируем его `onStop`.
    capturedCb?.onStop(new Blob(['webm-bytes']));

    const kinds = events.map((e) => e.evt);
    expect(kinds).toContain('blob');
    // После blob — состояние ready; треки источника освобождены (cleanup).
    const last = events.filter((e) => e.evt === 'state').pop();
    expect(last).toMatchObject({ state: 'ready' });
    expect(built.stop).toHaveBeenCalled();
  });

  it('maps a NotAllowedError while building the stream to permission-denied', async () => {
    buildStreamMock.mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    const events: RecorderEvent[] = [];

    const session = createRecordingSession((e) => events.push(e));
    session.start({ systemAudio: true, mic: true, maxDurationMs: 60_000 });
    await flush();

    const err = events.find((e) => e.evt === 'error');
    expect(err).toMatchObject({ evt: 'error', code: 'permission-denied' });
  });
});

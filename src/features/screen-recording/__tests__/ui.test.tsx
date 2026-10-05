import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { mergeCatalog, setLocale } from '@/i18n';
import { ok } from '@/shared/result';

// Путь с микрофоном (bugfix 6): панель открывает видимую вкладку-рекордер (в offscreen
// `getUserMedia` не получает грант). Мокаем контроллер вкладки — сама вкладка/каналы/
// платформа проверяются в его собственном тесте.
const openRecorderTabMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      close: vi.fn((): Promise<void> => Promise.resolve()),
      onClosed: vi.fn((): (() => void) => () => undefined),
    }),
  ),
);

// Конвертация в GIF — DOM/видео (декод кадров), в jsdom не исполнима: мокаем оркестратор.
const gifExportMock = vi.hoisted(() => ({
  encode: vi.fn((blob: Blob): Promise<Blob> =>
    Promise.resolve(new Blob([blob], { type: 'image/gif' })),
  ),
}));

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/features/screen-recording/recorder-tab/controller', () => ({
  openRecorderTab: openRecorderTabMock,
}));
vi.mock('@/features/screen-recording/gif-export', () => ({
  encodeRecordingToGif: gifExportMock.encode,
}));

// jsdom не реализует object URL — полифиллим, чтобы предпросмотр/скачивание не бросали.
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
globalThis.URL.revokeObjectURL = vi.fn();

import { sendMessage } from '@/shared/messaging/bus';
import { ToastProvider } from '@/ui/components';
import { ScreenRecordingPanel } from '@/features/screen-recording/ui';
import {
  RECORDING_CHANNEL,
  SCREEN_RECORDING_SETTINGS_DEFAULTS,
} from '@/features/screen-recording/types';
import type { RecorderCommand, RecorderEvent } from '@/features/screen-recording/types';
import { screenRecordingBinding } from '@/features/screen-recording/settings';
import ru from '@/features/screen-recording/i18n/ru';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <ScreenRecordingPanel />
    </ToastProvider>,
  );
}

/** Публикует событие offscreen → UI по каналу (как это делает рекордер). */
function emit(evt: RecorderEvent): void {
  const channel = new BroadcastChannel(RECORDING_CHANNEL);
  channel.postMessage(evt);
  channel.close();
}

beforeEach(() => {
  setLocale('ru');
  // Биндинг настроек — синглтон-signal на модуль: сбрасываем к дефолтам, чтобы выбор
  // аудио в одном тесте не протекал в сидирование следующего.
  screenRecordingBinding.value.value = SCREEN_RECORDING_SETTINGS_DEFAULTS;
  mockedSend.mockReset();
  openRecorderTabMock.mockReset().mockResolvedValue({
    close: vi.fn((): Promise<void> => Promise.resolve()),
    onClosed: vi.fn((): (() => void) => () => undefined),
  });
  gifExportMock.encode.mockReset().mockResolvedValue(new Blob(['gif'], { type: 'image/gif' }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ScreenRecordingPanel', () => {
  /** Собирает команды UI → offscreen на канале записи. Возвращает буфер и закрывалку. */
  function listenCommands(): { commands: RecorderCommand[]; close: () => void } {
    const listener = new BroadcastChannel(RECORDING_CHANNEL);
    const commands: RecorderCommand[] = [];
    listener.onmessage = (e: MessageEvent<RecorderCommand>): void => {
      commands.push(e.data);
    };
    return {
      commands,
      close: (): void => {
        listener.close();
      },
    };
  }

  it('renders the audio toggles and the start button in idle (no source selector)', () => {
    renderPanel();
    expect(screen.getByTestId('screen-recording')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать, что записывать' })).toBeInTheDocument();
    // Аудио-опции присутствуют (строки-переключатели role="switch").
    expect(screen.getByRole('switch', { name: /Микрофон/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Звук страницы/ })).toBeInTheDocument();
    // Сегмента выбора источника больше нет — захват идёт через нативный пикер каждый раз.
    expect(screen.queryByRole('radio', { name: 'Экран' })).not.toBeInTheDocument();
    // Нет активной сессии — управляющих кнопок стоп/пауза нет.
    expect(screen.queryByRole('button', { name: 'Стоп' })).not.toBeInTheDocument();
  });

  it('starts a recording: prepares offscreen and posts a start command (display path in offscreen)', async () => {
    // Захват видео целиком в offscreen (getDisplayMedia) — фон лишь готовит offscreen/бейдж.
    mockedSend.mockResolvedValue(ok({ ok: true }));
    const { commands, close } = listenCommands();

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать, что записывать' }));

    // Фон лишь готовит контекст (offscreen/бейдж) — запрос без полей.
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('screenrec/start', {});
    });

    await waitFor(() => {
      expect(commands.some((c) => c.cmd === 'start')).toBe(true);
    });
    const startCmd = commands.find((c) => c.cmd === 'start');
    // Команда несёт только параметры сессии; звук системы по умолчанию включён, микрофон — нет.
    expect(startCmd).toMatchObject({ cmd: 'start', systemAudio: true, mic: false });
    // Микрофон выключен → вкладка-рекордер не открывается (путь целиком в offscreen).
    expect(openRecorderTabMock).not.toHaveBeenCalled();

    close();
  });

  it('opens the recorder tab when mic is on (no offscreen, no start command from the panel)', async () => {
    // Микрофон включён → запись идёт в видимой вкладке-рекордере (в offscreen `getUserMedia`
    // не получает грант — корень бага). Панель НЕ поднимает offscreen и НЕ шлёт `start`:
    // сам захват инициирует клик в самой вкладке.
    screenRecordingBinding.value.value = { ...SCREEN_RECORDING_SETTINGS_DEFAULTS, mic: true };
    mockedSend.mockResolvedValue(ok({ ok: true }));
    const { commands, close } = listenCommands();

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать, что записывать' }));

    await waitFor(() => {
      expect(openRecorderTabMock).toHaveBeenCalledTimes(1);
    });
    expect(openRecorderTabMock).toHaveBeenCalledWith(
      expect.objectContaining({ mic: true, systemAudio: true }),
    );
    // Offscreen не готовим и `start` по каналу не шлём (это делает сама вкладка).
    expect(mockedSend).not.toHaveBeenCalledWith('screenrec/start', {});
    expect(commands.some((c) => c.cmd === 'start')).toBe(false);

    close();
  });

  it('does not open a second recorder tab while one is already open', async () => {
    screenRecordingBinding.value.value = { ...SCREEN_RECORDING_SETTINGS_DEFAULTS, mic: true };
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать, что записывать' }));
    await waitFor(() => {
      expect(openRecorderTabMock).toHaveBeenCalledTimes(1);
    });
    // Панель ушла из idle (фаза «requesting») — повторная кнопка «Начать» недоступна, а
    // прямой повторный запуск не плодит вторую вкладку.
    expect(
      screen.queryByRole('button', { name: 'Выбрать, что записывать' }),
    ).not.toBeInTheDocument();
    expect(openRecorderTabMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a localized error when start is rejected by background', async () => {
    mockedSend.mockResolvedValue(ok({ ok: false, reason: 'user cancelled picker' }));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать, что записывать' }));
    await waitFor(() => {
      expect(screen.getByTestId('screen-recording-error')).toHaveTextContent('Запись отменена.');
    });
  });

  it('clears the REC badge (finalize) when the offscreen reports an error (e.g. picker dismissed)', async () => {
    // Пикер `getDisplayMedia` живёт в offscreen: его отмена приходит событием `error` по
    // каналу. UI обязан снять бейдж/закрыть offscreen через `screenrec/finalize`.
    mockedSend.mockResolvedValue(ok({ ok: true }));
    renderPanel();

    emit({ evt: 'error', code: 'permission-denied', message: 'NotAllowedError' });

    await waitFor(() => {
      expect(screen.getByTestId('screen-recording-error')).toBeInTheDocument();
    });
    expect(mockedSend).toHaveBeenCalledWith('screenrec/finalize', {});
  });

  it('reflects controlsFor: recording exposes stop/pause and leaves the idle setup', async () => {
    renderPanel();
    emit({ evt: 'state', state: 'recording' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Стоп' })).toBeEnabled();
    });
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeEnabled();
    // Фаза записи заменяет экран настройки — кнопки старта на нём нет.
    expect(
      screen.queryByRole('button', { name: 'Выбрать, что записывать' }),
    ).not.toBeInTheDocument();
  });

  it('reflects controlsFor: paused swaps pause for resume', async () => {
    renderPanel();
    emit({ evt: 'state', state: 'paused' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled();
    });
    expect(screen.queryByRole('button', { name: 'Пауза' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стоп' })).toBeEnabled();
  });

  it('updates the live timer and size from progress events', async () => {
    renderPanel();
    emit({ evt: 'state', state: 'recording' });
    emit({ evt: 'progress', elapsedMs: 65_000, sizeBytes: 2 * 1024 * 1024 });
    await waitFor(() => {
      expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    });
    expect(screen.getByTestId('screen-recording-status')).toHaveTextContent('2.0 MB');
  });

  // ── экспорт в GIF ────────────────────────────────────────────────────────────

  /** Доводит панель до состояния `ready` с готовым `Blob` (как offscreen после стопа). */
  function emitReadyResult(): void {
    emit({
      evt: 'blob',
      blob: new Blob(['webm'], { type: 'video/webm' }),
      mimeType: 'video/webm',
      durationMs: 1000,
      sizeBytes: 4,
    });
  }

  /** В фазе ready переключает формат на GIF и жмёт первичную кнопку скачивания. */
  async function startGifExport(): Promise<void> {
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Скачать видео' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('radio', { name: 'GIF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скачать GIF' }));
  }

  it('offers a GIF export format once a recording is ready', async () => {
    renderPanel();
    emitReadyResult();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Скачать видео' })).toBeInTheDocument();
    });
    // Формат выбирается сегментами: WebM (по умолчанию) или GIF.
    expect(screen.getByRole('radio', { name: 'Видео (WebM)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'GIF' })).toBeInTheDocument();
  });

  it('exports to GIF after confirmation: converts the recorded blob and downloads', async () => {
    renderPanel();
    emitReadyResult();
    await startGifExport();

    // Скачивание — только по подтверждению (продуктовая политика загрузки файла).
    const confirm = await screen.findByTestId('screenrec-confirm');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => {
      expect(gifExportMock.encode).toHaveBeenCalledTimes(1);
    });
    // Конвертируется записанный ролик (первый аргумент — переданный Blob записи).
    // (В jsdom `BroadcastChannel` не сохраняет тип Blob при structured clone, поэтому
    // проверяем факт передачи объекта, а не `instanceof Blob`.)
    expect(gifExportMock.encode.mock.calls[0]?.[0]).toBeDefined();
    expect(screen.queryByTestId('screen-recording-error')).not.toBeInTheDocument();
  });

  it('surfaces a localized error when GIF conversion fails', async () => {
    gifExportMock.encode.mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    emitReadyResult();
    await startGifExport();
    const confirm = await screen.findByTestId('screenrec-confirm');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => {
      expect(screen.getByTestId('screen-recording-error')).toHaveTextContent(
        'Не удалось собрать GIF',
      );
    });
  });

  it('does not convert to GIF if the confirmation is cancelled', async () => {
    renderPanel();
    emitReadyResult();
    await startGifExport();
    const confirm = await screen.findByTestId('screenrec-confirm');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Отмена' }));

    expect(gifExportMock.encode).not.toHaveBeenCalled();
  });
});

/**
 * Оркестратор одной сессии записи (TASK-037, ADR-0045; ревизия 2026-09-22 bugfix 6).
 *
 * Единый источник правды для «как ведётся запись»: собрать поток (`capture.ts`), крутить
 * `MediaRecorder` (`recorder.ts`), вести таймеры прогресса и жёсткого лимита длительности,
 * реагировать на нативный «Stop sharing» и гарантированно освобождать устройства
 * (`built.stop()`), чтобы OS-индикатор захвата не «висел». Публикация событий наружу —
 * через инъектируемый `post`, поэтому оркестратор НЕ знает, где он крутится.
 *
 * Зачем вынесено из `offscreen.ts`: с bugfix 6 запись С МИКРОФОНОМ идёт не в offscreen, а
 * в видимой вкладке-рекордере (`getUserMedia` надёжно работает лишь в том документе, где
 * сам получен грант — грант из отдельной вкладки в offscreen НЕ пробрасывается). Оба хоста
 * — offscreen (видео/звук системы, без микрофона) и вкладка-рекордер (с микрофоном) —
 * используют ЭТОТ же оркестратор, отличаясь лишь тем, ЧЕМ инициируется старт (командой по
 * каналу vs жестом-кликом в самой вкладке) и как закрывается контекст.
 */
import { TIMESLICE_MS } from './types';
import type { RecorderErrorCode, RecorderEvent, RecordingState } from './types';
import { pickMimeType } from './logic';
import { buildRecordingStream } from './capture';
import type { BuiltStream } from './capture';
import { startRecorder } from './recorder';
import type { RecorderHandle } from './recorder';

/** Интервал тика прогресса (мс). */
const PROGRESS_INTERVAL_MS = 1000;

/** Параметры старта сессии (что записывать). */
export interface SessionStartParams {
  /** Запросить звук системы/вкладки у `getDisplayMedia` (чекбокс пикера). */
  readonly systemAudio: boolean;
  /** Домешать микрофон (`getUserMedia({ audio:true })`). */
  readonly mic: boolean;
  /** Жёсткий лимит длительности (мс) — по нему запись автоостанавливается. */
  readonly maxDurationMs: number;
}

/** Управление одной сессией записи. Команды идемпотентны и безопасны к двойному вызову. */
export interface RecordingSession {
  /** Начать запись (внутри — асинхронная добыча потока; промис не течёт наружу). */
  start: (params: SessionStartParams) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/**
 * Создаёт сессию записи, публикующую события через `post`. Всё состояние — в замыкании
 * (а не на модульном уровне), поэтому импорт модуля вне контекста записи ничего не заводит.
 */
export function createRecordingSession(post: (evt: RecorderEvent) => void): RecordingSession {
  const postState = (state: RecordingState): void => {
    post({ evt: 'state', state });
  };
  const postError = (code: RecorderErrorCode, message: string): void => {
    post({ evt: 'error', code, message });
  };

  // — Состояние текущей сессии записи (сессия одна) —
  let built: BuiltStream | null = null;
  let handle: RecorderHandle | null = null;
  let sizeBytes = 0;
  // Учёт длительности без пауз: накопленное время завершённых сегментов + текущий сегмент.
  let accumulatedMs = 0;
  let segmentStart = 0; // 0 = сегмент не идёт (пауза/стоп)
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  /** Прошедшее время записи без учёта пауз. */
  const elapsedMs = (): number => {
    const running = segmentStart > 0 ? Date.now() - segmentStart : 0;
    return accumulatedMs + running;
  };

  /** Фиксирует текущий сегмент в накопленное время (на паузе/стопе). */
  const freezeElapsed = (): void => {
    if (segmentStart > 0) {
      accumulatedMs += Date.now() - segmentStart;
      segmentStart = 0;
    }
  };

  /** Идемпотентная очистка сессии: таймеры, треки потока, сброс состояния. */
  const cleanup = (): void => {
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (built !== null) {
      built.stop();
      built = null;
    }
    handle = null;
    segmentStart = 0;
    accumulatedMs = 0;
    sizeBytes = 0;
  };

  /** Классифицирует ошибку старта в `RecorderErrorCode` для локализации в UI. */
  const mapError = (err: unknown): { code: RecorderErrorCode; message: string } => {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || message.includes('NotAllowedError')) {
      return { code: 'permission-denied', message };
    }
    if (message.toLowerCase().includes('unsupported')) {
      return { code: 'unsupported', message };
    }
    return { code: 'capture-failed', message };
  };

  /**
   * Единый путь остановки (команда `stop`, лимит длительности, нативный «Stop sharing»).
   * `handle.stop()` асинхронно приведёт к `onStop` рекордера (там `Blob` + `ready` +
   * cleanup). Без активного рекордера — просто очистка. Двойной вызов безвреден.
   */
  const stop = (): void => {
    if (handle === null) {
      cleanup();
      return;
    }
    freezeElapsed();
    postState('finalizing');
    handle.stop();
  };

  /** Обработка старта (асинхронная работа обёрнута, чтобы не течь промисом). */
  const start = (params: SessionStartParams): void => {
    void (async (): Promise<void> => {
      postState('requesting');
      try {
        built = await buildRecordingStream({ systemAudio: params.systemAudio, mic: params.mic });

        const mime = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
        if (mime === null) {
          throw new Error('unsupported: no MediaRecorder MIME type supported');
        }

        sizeBytes = 0;
        accumulatedMs = 0;

        handle = startRecorder(built.stream, mime, TIMESLICE_MS, {
          onData: (chunkBytes) => {
            sizeBytes += chunkBytes;
          },
          onStop: (blob) => {
            freezeElapsed();
            const durationMs = elapsedMs();
            post({ evt: 'blob', blob, mimeType: mime, durationMs, sizeBytes: blob.size });
            postState('ready');
            cleanup();
          },
          onError: (error) => {
            postError('recorder-failed', error.message);
            cleanup();
          },
        });

        // Нативный «Stop sharing» браузера → трек завершается: останавливаем запись.
        const videoTrack = built.stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', () => {
            stop();
          });
        }

        segmentStart = Date.now();
        postState('recording');

        progressTimer = setInterval(() => {
          post({ evt: 'progress', elapsedMs: elapsedMs(), sizeBytes });
        }, PROGRESS_INTERVAL_MS);

        maxTimer = setTimeout(() => {
          stop();
        }, params.maxDurationMs);
      } catch (err) {
        const { code, message } = mapError(err);
        postError(code, message);
        cleanup();
      }
    })();
  };

  return {
    start,
    stop,
    pause: (): void => {
      if (handle !== null) {
        handle.pause();
        freezeElapsed();
        postState('paused');
      }
    },
    resume: (): void => {
      if (handle !== null) {
        handle.resume();
        segmentStart = Date.now();
        postState('recording');
      }
    },
  };
}

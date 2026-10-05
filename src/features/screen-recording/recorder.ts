/**
 * Тонкая обёртка над `MediaRecorder` (TASK-037, offscreen-контекст).
 *
 * Копит чанки таймслайса, собирает итоговый `Blob` при остановке и прокидывает
 * прогресс/сбой в колбэки. Логики состояний/лимитов здесь нет — она в чистом ядре
 * (`logic.ts`) и в оркестраторе offscreen; обёртка лишь безопасно дёргает рекордер
 * (переходы защищены проверкой `recorder.state`, чтобы двойной stop/pause не бросал).
 */

export interface RecorderCallbacks {
  /** Пришёл непустой чанк — его размер в байтах (для аккумуляции прогресса). */
  onData: (chunkBytes: number) => void;
  /** Рекордер остановлен — собран итоговый `Blob`. */
  onStop: (blob: Blob) => void;
  /** Сбой рекордера в процессе записи. */
  onError: (error: Error) => void;
}

export interface RecorderHandle {
  /** Остановить запись (приведёт к `onStop`). */
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/**
 * Запускает `MediaRecorder` над готовым потоком. `timesliceMs` — интервал чанка
 * (`ondataavailable` раз в интервал). Возвращает хендл управления.
 */
export function startRecorder(
  stream: MediaStream,
  mimeType: string,
  timesliceMs: number,
  cb: RecorderCallbacks,
): RecorderHandle {
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event: BlobEvent): void => {
    if (event.data.size > 0) {
      chunks.push(event.data);
      cb.onData(event.data.size);
    }
  };
  recorder.onstop = (): void => {
    cb.onStop(new Blob(chunks, { type: mimeType }));
  };
  recorder.onerror = (event: Event): void => {
    // `MediaRecorderErrorEvent` есть не во всех версиях lib.dom — читаем поле `error`
    // защитно, без опоры на конкретный тип события.
    const maybeError = (event as { error?: unknown }).error;
    cb.onError(maybeError instanceof Error ? maybeError : new Error('MediaRecorder error'));
  };

  recorder.start(timesliceMs);

  return {
    stop: (): void => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    pause: (): void => {
      if (recorder.state === 'recording') recorder.pause();
    },
    resume: (): void => {
      if (recorder.state === 'paused') recorder.resume();
    },
  };
}

/**
 * Оркестратор экспорта записи в GIF (TASK-037, ADR-0045) — DOM-слой side panel.
 *
 * Берёт готовый WebM-`Blob`, декодирует его кадры через `<video>` + `<canvas>` (в SW
 * их нет — поэтому здесь, в UI-контексте), планирует выборку кадров чистой `planGif`,
 * кодирует каждый кадр чистым `encodeGifFrame` и собирает итоговый `image/gif`.
 * Кодирование идёт кооперативно (уступаем поток между кадрами) и репортит прогресс —
 * панель не подвисает. Тяжёлую CPU-часть не выносим в Worker сознательно: бандлинг
 * воркера в MV3/@crxjs добавляет хрупкости и CSP-поверхности, а объём кадров жёстко
 * ограничен планом (`GIF_MAX_FRAMES`/`GIF_MAX_WIDTH`) — кооперативной уступки хватает.
 *
 * Приватность неизменна: `Blob` уже локальный, GIF собирается локально, наружу ничего
 * не уходит. Ошибки декодирования/отмена пробрасываются вызывающему (UI локализует).
 */
import { planGif } from './logic';
import { GIF_MAX_COLORS } from './types';
import { encodeGifFrame, gifHeader, GIF_TRAILER } from './gif';

/** Фаза прогресса экспорта: сбор кадров или их кодирование. */
export interface GifProgress {
  readonly phase: 'decoding' | 'encoding';
  /** Сколько кадров уже обработано. */
  readonly done: number;
  /** Всего кадров в плане. */
  readonly total: number;
}

export interface EncodeGifOptions {
  /** Колбэк прогресса (0..total), для индикатора в UI. */
  readonly onProgress?: (progress: GifProgress) => void;
  /** Отмена (кнопка «Отмена» / размонтирование): прерывает и бросает `AbortError`. */
  readonly signal?: AbortSignal;
}

/** Максимальное ожидание метаданных/перемотки (мс) — защита от зависшего декодера. */
const VIDEO_OP_TIMEOUT_MS = 15_000;

/** Обещание с таймаутом: reject, если событие не пришло за `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`gif-export: timeout waiting for ${label}`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Бросает `AbortError`, если экспорт отменён (единый путь проверки сигнала). */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException('GIF export aborted', 'AbortError');
  }
}

/** Ждёт загрузки метаданных `<video>` (размеры/длительность доступны). */
function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = (): void => {
        resolve();
      };
      video.onerror = (): void => {
        reject(new Error('gif-export: video failed to load'));
      };
    }),
    VIDEO_OP_TIMEOUT_MS,
    'metadata',
  );
}

/**
 * `MediaRecorder`-WebM часто отдаёт `duration = Infinity`, пока не перемотать в конец.
 * Форсируем реальную длительность: прыгаем на «край» и ждём, когда она станет конечной.
 */
async function resolveDurationMs(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration * 1000;
  }
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const onUpdate = (): void => {
        if (Number.isFinite(video.duration)) {
          video.ontimeupdate = null;
          resolve();
        }
      };
      video.ontimeupdate = onUpdate;
      video.onerror = (): void => {
        reject(new Error('gif-export: video failed while resolving duration'));
      };
      try {
        video.currentTime = 1e9; // за конец → браузер зафиксирует реальную длительность
      } catch {
        // проигнорируем — событие/таймаут разрешат промис
      }
    }),
    VIDEO_OP_TIMEOUT_MS,
    'duration',
  );
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : 0;
}

/** Перематывает `<video>` в момент `timeSec` и ждёт готовности кадра. */
function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onseeked = (): void => {
        resolve();
      };
      video.onerror = (): void => {
        reject(new Error('gif-export: video failed while seeking'));
      };
      try {
        video.currentTime = timeSec;
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }),
    VIDEO_OP_TIMEOUT_MS,
    'seek',
  );
}

/** Уступает управление циклу событий (кооперативная нарезка тяжёлого кодирования). */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Кодирует WebM-запись в анимированный GIF. Возвращает `Blob` типа `image/gif`.
 * Прогресс — через `onProgress`; отмена — через `signal` (бросает `AbortError`).
 * Всегда освобождает `<video>`/objectURL, даже при ошибке.
 */
export async function encodeRecordingToGif(
  blob: Blob,
  options: EncodeGifOptions = {},
): Promise<Blob> {
  const { onProgress, signal } = options;
  throwIfAborted(signal);

  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  // Не в DOM-дереве — рендер не нужен, только декод в canvas.
  video.src = objectUrl;

  try {
    await waitForMetadata(video);
    throwIfAborted(signal);

    const durationMs = await resolveDurationMs(video);
    throwIfAborted(signal);

    const plan = planGif(durationMs, video.videoWidth, video.videoHeight);

    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) throw new Error('gif-export: 2D canvas context unavailable');

    const chunks: Uint8Array[] = [gifHeader(plan.width, plan.height)];

    for (let i = 0; i < plan.frameCount; i++) {
      throwIfAborted(signal);
      const timeSec = plan.stepMs > 0 ? (i * plan.stepMs) / 1000 : 0;
      await seekTo(video, timeSec);
      onProgress?.({ phase: 'decoding', done: i + 1, total: plan.frameCount });

      ctx.drawImage(video, 0, 0, plan.width, plan.height);
      const { data } = ctx.getImageData(0, 0, plan.width, plan.height);

      chunks.push(encodeGifFrame(data, plan.width, plan.height, plan.delayCs, GIF_MAX_COLORS));
      onProgress?.({ phase: 'encoding', done: i + 1, total: plan.frameCount });

      await yieldToEventLoop(); // не блокируем поток панели
    }

    chunks.push(GIF_TRAILER);
    return new Blob(chunks, { type: 'image/gif' });
  } finally {
    video.onloadedmetadata = null;
    video.ontimeupdate = null;
    video.onseeked = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

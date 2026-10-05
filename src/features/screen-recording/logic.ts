/**
 * Чистое ядро фичи «Запись экрана» (TASK-037): выбор MIME (за seam
 * `isTypeSupported`), валидация/форматирование лимитов, форматирование таймера и
 * размера, машина состояний записи и производные доступности контролов, имя файла.
 *
 * Без DOM и без `chrome.*` (инвариант чистоты, ARCHITECTURE §1): всё, что зависит от
 * платформы/медиа, инъектируется как аргумент (напр. `isSupported`) и мокается в
 * тестах. Тестируется без браузера, целевое покрытие ~100% (PRD §12).
 */
import {
  DURATION_OPTIONS_MS,
  GIF_MAX_COLORS,
  GIF_MAX_FRAMES,
  GIF_MAX_WIDTH,
  GIF_TARGET_FPS,
  MAX_DURATION_MS,
  MIME_PREFERENCES,
  SIZE_WARN_RATIO,
  SOFT_SIZE_LIMIT_BYTES,
} from './types';
import type { RecordingState } from './types';

/**
 * Выбирает первый поддержанный MIME из `MIME_PREFERENCES`. `isSupported` —
 * seam над `MediaRecorder.isTypeSupported` (в SW/тестах его нет). `null`, если ни
 * один кодек не поддержан — вызывающий обязан обработать (`unsupported`).
 */
export function pickMimeType(isSupported: (mime: string) => boolean): string | null {
  for (const mime of MIME_PREFERENCES) {
    if (isSupported(mime)) return mime;
  }
  return null;
}

/**
 * Зажимает выбранный лимит длительности в допустимый диапазон: не меньше
 * минимального предложенного варианта и не больше жёсткого `MAX_DURATION_MS`.
 * Нечисловое/неположительное → минимальный вариант (защитно).
 */
export function clampDuration(ms: number): number {
  const min = DURATION_OPTIONS_MS[0] ?? 60_000;
  if (!Number.isFinite(ms) || ms <= 0) return min;
  return Math.min(Math.max(ms, min), MAX_DURATION_MS);
}

/** Форматирует длительность (мс) как `m:ss` (или `mm:ss` при ≥ 10 минут). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, '0')}`;
}

/** Человекочитаемый размер (B / KB / MB) с одним знаком после запятой для MB/KB. */
export function formatBytes(bytes: number): string {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (b < 1024) return `${b.toString()} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Доля заполнения мягкого лимита размера (0..∞; 1 = лимит достигнут). */
export function sizeRatio(bytes: number, softLimit: number = SOFT_SIZE_LIMIT_BYTES): number {
  if (softLimit <= 0) return 0;
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  return b / softLimit;
}

/** Близко ли к мягкому лимиту размера (для предупреждения в UI). */
export function isNearSizeLimit(bytes: number, softLimit: number = SOFT_SIZE_LIMIT_BYTES): boolean {
  return sizeRatio(bytes, softLimit) >= SIZE_WARN_RATIO;
}

/**
 * Действия машины состояний записи. Отражают внешние переходы: запрос старта,
 * подтверждение старта рекордером, пауза/резюме, начало финализации, готовность
 * `Blob`, сбой и сброс к исходному.
 */
export type RecordingAction =
  | { readonly type: 'request' }
  | { readonly type: 'started' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'finalize' }
  | { readonly type: 'ready' }
  | { readonly type: 'error' }
  | { readonly type: 'reset' };

/**
 * Чистый редьюсер машины состояний. Недопустимые переходы игнорируются (возврат
 * текущего состояния) — UI не должен уметь их инициировать, но редьюсер устойчив.
 * `error`/`reset` доступны из любого состояния (терминальный сбой / возврат в idle).
 */
export function reduceRecording(state: RecordingState, action: RecordingAction): RecordingState {
  if (action.type === 'error') return 'error';
  if (action.type === 'reset') return 'idle';

  switch (state) {
    case 'idle':
      return action.type === 'request' ? 'requesting' : state;
    case 'requesting':
      return action.type === 'started' ? 'recording' : state;
    case 'recording':
      if (action.type === 'pause') return 'paused';
      if (action.type === 'finalize') return 'finalizing';
      return state;
    case 'paused':
      if (action.type === 'resume') return 'recording';
      if (action.type === 'finalize') return 'finalizing';
      return state;
    case 'finalizing':
      return action.type === 'ready' ? 'ready' : state;
    case 'ready':
    case 'error':
      return state;
  }
}

/** Идёт ли активная запись (в т.ч. на паузе) — для индикатора/бейджа. */
export function isCapturing(state: RecordingState): boolean {
  return state === 'recording' || state === 'paused';
}

/** Доступность контролов, производная от состояния (единый источник для UI). */
export interface RecordingControls {
  readonly canStart: boolean;
  readonly canStop: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  /** Идёт межсостояниевый переход — контролы заблокированы. */
  readonly busy: boolean;
}

export function controlsFor(state: RecordingState): RecordingControls {
  return {
    canStart: state === 'idle' || state === 'ready' || state === 'error',
    canStop: state === 'recording' || state === 'paused',
    canPause: state === 'recording',
    canResume: state === 'paused',
    busy: state === 'requesting' || state === 'finalizing',
  };
}

/** Двузначная дата-часть для имени файла. */
function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Имя файла записи: `qa-recording-YYYYMMDD-HHmmss.<ext>`. Детерминировано от даты
 * (тестируемо). Только безопасные символы (кроссплатформенное имя файла). `ext` —
 * расширение без точки (`webm` по умолчанию, `gif` для экспорта в GIF). Источник в имя
 * больше не входит: его в UI нет (поверхность выбирается в пикере при каждом старте).
 */
export function recordingFileName(date: Date, ext = 'webm'): string {
  const stamp =
    `${date.getFullYear().toString()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `qa-recording-${stamp}.${ext}`;
}

// ── План экспорта в GIF (чистое, тестируемое) ────────────────────────────────────

/** Опции планирования GIF (переопределяют дефолты `types.ts`). */
export interface GifPlanOptions {
  /** Целевая частота кадров (к/с). */
  readonly fps?: number;
  /** Максимальная ширина кадра (px). */
  readonly maxWidth?: number;
  /** Жёсткий потолок числа кадров. */
  readonly maxFrames?: number;
}

/**
 * План кодирования GIF: итоговые размеры кадра, число кадров, шаг выборки по ролику и
 * задержка между кадрами. Всё производное — вычисляется здесь (чисто, тестируемо), а
 * DOM-оркестратор (`gif-export.ts`) лишь исполняет план.
 */
export interface GifPlan {
  /** Ширина кадра GIF (чётная, ≥2). */
  readonly width: number;
  /** Высота кадра GIF (чётная, ≥2). */
  readonly height: number;
  /** Сколько кадров выбрать из ролика. */
  readonly frameCount: number;
  /** Шаг по времени ролика между кадрами (мс); `0` при одном кадре. */
  readonly stepMs: number;
  /** Задержка кадра в сотых долях секунды (GIF-единица); ≥2. */
  readonly delayCs: number;
}

/** Приводит размер к чётному значению ≥2 (требование пар-семплинга кодеков/скейла). */
function toEvenDim(value: number): number {
  const v = Math.max(2, Math.round(Number.isFinite(value) && value > 0 ? value : 2));
  return v % 2 === 0 ? v : v - 1;
}

/**
 * Планирует экспорт GIF из длительности и исходных размеров кадра.
 *
 * - Кадры выбираются на ВСЮ длительность: при коротком ролике — с целевой частотой
 *   (`fps`), при длинном — прореживаются до `maxFrames` (обзорный «таймлапс»), чтобы
 *   GIF не разрастался. Задержка кадра выводится из реального шага, поэтому темп
 *   воспроизведения близок к исходному.
 * - Размер кадра масштабируется вниз до `maxWidth` с сохранением пропорций; размеры
 *   приводятся к чётным ≥2. Неизвестные/битые исходные размеры → `maxWidth × 16:9`.
 *
 * Чистая функция (без DOM): целиком тестируема.
 */
export function planGif(
  durationMs: number,
  sourceWidth: number,
  sourceHeight: number,
  options: GifPlanOptions = {},
): GifPlan {
  const fps = options.fps !== undefined && options.fps > 0 ? options.fps : GIF_TARGET_FPS;
  const maxWidth =
    options.maxWidth !== undefined && options.maxWidth > 0 ? options.maxWidth : GIF_MAX_WIDTH;
  const maxFrames =
    options.maxFrames !== undefined && options.maxFrames >= 1
      ? Math.floor(options.maxFrames)
      : GIF_MAX_FRAMES;

  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const intervalMs = 1000 / fps;

  // Число кадров: минимум 1; при известной длительности — по частоте, но не выше потолка.
  const rawFrames = duration <= 0 ? 1 : Math.max(1, Math.round(duration / intervalMs));
  const frameCount = Math.min(rawFrames, maxFrames);

  // Шаг по ролику: равномерно на всю длительность (прореживание при упоре в потолок).
  const stepMs = frameCount > 1 && duration > 0 ? duration / frameCount : 0;
  const perFrameMs = stepMs > 0 ? stepMs : intervalMs;
  const delayCs = Math.min(65_535, Math.max(2, Math.round(perFrameMs / 10)));

  // Размеры: масштаб вниз до maxWidth (никогда не увеличиваем), чётные ≥2.
  const validSrc =
    Number.isFinite(sourceWidth) &&
    Number.isFinite(sourceHeight) &&
    sourceWidth > 0 &&
    sourceHeight > 0;
  let width: number;
  let height: number;
  if (validSrc) {
    const scale = Math.min(1, maxWidth / sourceWidth);
    width = toEvenDim(sourceWidth * scale);
    height = toEvenDim(sourceHeight * scale);
  } else {
    width = toEvenDim(maxWidth);
    height = toEvenDim((maxWidth * 9) / 16);
  }

  return { width, height, frameCount, stepMs, delayCs };
}

/** Максимум цветов палитры GIF-кадра (реэкспорт из `types` для удобства оркестратора). */
export const GIF_PALETTE_MAX = GIF_MAX_COLORS;

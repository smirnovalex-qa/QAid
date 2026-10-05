/**
 * Сериализуемые типы фичи «Запись экрана с аудио» (TASK-037) + протокол
 * `BroadcastChannel` между offscreen-рекордером и UI.
 *
 * Живут отдельно от `logic.ts`, чтобы UI / capture / recorder / offscreen тянули
 * типы, не проходя через инвариант чистоты `logic.ts` (без DOM/`chrome.*`).
 * Ссылки на `Blob` — только на уровне ТИПОВ (structured clone `BroadcastChannel`);
 * рантайм чистого ядра `Blob` не касается.
 */

/**
 * Состояние машины записи. `requesting` — идёт добыча `streamId`/поднятие offscreen;
 * `finalizing` — рекордер остановлен, собирается `Blob`; `ready` — `Blob` получен и
 * доступен для предпросмотра/скачивания; `error` — терминальный сбой (см. `RecorderErrorCode`).
 */
export type RecordingState =
  'idle' | 'requesting' | 'recording' | 'paused' | 'finalizing' | 'ready' | 'error';

/** Классы сбоев записи (для локализованного объяснения в UI). */
export type RecorderErrorCode =
  | 'permission-denied' // пользователь отклонил пикер/микрофон
  | 'unsupported' // ни один MIME не поддержан MediaRecorder
  | 'capture-failed' // не удалось построить поток
  | 'recorder-failed' // MediaRecorder бросил в процессе
  | 'no-data'; // запись завершилась пустой

/**
 * Персистентные настройки фичи (namespace `screen-recording`).
 *
 * Источник видео здесь НЕ хранится: с ревизии 2026-09-21 (bugfix 4) выбор поверхности
 * ушёл целиком в нативный пикер `getDisplayMedia` (он открывается при каждом старте),
 * поэтому в UI сегмента «Что записать» больше нет — остаются только аудио-опции и лимит.
 */
export interface ScreenRecordingSettingsState {
  /** Домешивать микрофон (рантайм-согласие `getUserMedia`; право не требуется). */
  readonly mic: boolean;
  /** Запрашивать звук системы/вкладки у `getDisplayMedia` (чекбокс «Поделиться звуком»). */
  readonly systemAudio: boolean;
  /** Жёсткий лимит длительности, мс (offscreen автоостанавливает по нему). */
  readonly maxDurationMs: number;
}

export const SCREEN_RECORDING_SETTINGS_DEFAULTS: ScreenRecordingSettingsState = {
  mic: false,
  systemAudio: true,
  maxDurationMs: 300_000, // 5 минут — дефолтный максимум (см. DURATION_OPTIONS_MS)
};

/** Верхняя граница длительности (жёсткая): 5 минут. */
export const MAX_DURATION_MS = 300_000;

/** Предлагаемые пользователю лимиты длительности (сек → мс): 1 / 3 / 5 минут. */
export const DURATION_OPTIONS_MS: readonly number[] = [60_000, 180_000, 300_000];

/**
 * Мягкий лимит размера (байты): 512 МБ. Не прерывает запись, но UI предупреждает при
 * приближении (`isNearSizeLimit`) — WebM QA-клипов обычно много меньше, но экран в
 * высоком разрешении растёт быстро.
 */
export const SOFT_SIZE_LIMIT_BYTES = 512 * 1024 * 1024;

/** Порог предупреждения о приближении к мягкому лимиту размера (доля). */
export const SIZE_WARN_RATIO = 0.8;

/**
 * Предпочтения MIME для `MediaRecorder` (первый поддержанный побеждает). VP9/Opus →
 * VP8/Opus → голый `video/webm`. Проверяется через seam `isTypeSupported` в offscreen
 * (в SW `MediaRecorder` отсутствует).
 */
export const MIME_PREFERENCES: readonly string[] = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** Интервал таймслайса `MediaRecorder` (мс): чанк раз в секунду. */
export const TIMESLICE_MS = 1000;

// ── Экспорт в GIF (TASK-037, ADR-0045) ──────────────────────────────────────────
//
// GIF — палитровый (≤256 цветов), покадровый и без аудио: пригоден для КОРОТКИХ
// демонстраций (баг «показать и рассказать»), но растёт нелинейно. Поэтому по
// умолчанию агрессивно ограничиваем частоту кадров, ширину и число кадров —
// длинные ролики лучше отдавать как WebM. Значения — «мягкие» дефолты для `planGif`.

/** Целевая частота кадров GIF (к/с). Больше — плавнее, но кратно тяжелее. */
export const GIF_TARGET_FPS = 10;

/** Максимальная ширина кадра GIF (px). Кадр масштабируется вниз с сохранением пропорций. */
export const GIF_MAX_WIDTH = 480;

/**
 * Жёсткий потолок числа кадров GIF. Если ролик длиннее, кадры прореживаются на всю
 * длительность (обзорный «таймлапс»), а не обрезаются — GIF остаётся представлением
 * всего ролика, но воспроизводится компактно.
 */
export const GIF_MAX_FRAMES = 120;

/** Максимум цветов в палитре кадра (GIF89a — до 256). */
export const GIF_MAX_COLORS = 256;

/** Имя канала `BroadcastChannel` между offscreen-рекордером и UI. */
export const RECORDING_CHANNEL = 'qa-screen-recording';

/**
 * Команды UI → offscreen (по `BroadcastChannel`; сериализуемы — structured clone).
 *
 * Захват видео целиком лежит на offscreen: `start` только описывает параметры сессии, а
 * сам поток строит `capture.ts` через `getDisplayMedia` (нативный пикер поверхности при
 * каждом старте) + опционально микрофон. С ревизии 2026-09-21 (bugfix 4) вкладочный
 * `streamId`/`CapturePlan` больше не передаются: единственный путь видео — `getDisplayMedia`
 * прямо в offscreen (его `MediaStream` границу документов и не должен пересекать).
 */
export type RecorderCommand =
  | {
      readonly cmd: 'start';
      /** Запросить звук системы/вкладки у `getDisplayMedia` (чекбокс пикера). */
      readonly systemAudio: boolean;
      /** Домешать микрофон (`getUserMedia({ audio:true })` в offscreen; право предзапрошено в UI). */
      readonly mic: boolean;
      readonly maxDurationMs: number;
    }
  | { readonly cmd: 'stop' }
  | { readonly cmd: 'pause' }
  | { readonly cmd: 'resume' };

/** События offscreen → UI (по `BroadcastChannel`). */
export type RecorderEvent =
  | { readonly evt: 'state'; readonly state: RecordingState }
  | { readonly evt: 'progress'; readonly elapsedMs: number; readonly sizeBytes: number }
  | {
      readonly evt: 'blob';
      readonly blob: Blob;
      readonly mimeType: string;
      readonly durationMs: number;
      readonly sizeBytes: number;
    }
  | { readonly evt: 'error'; readonly code: RecorderErrorCode; readonly message: string };

/** Готовый результат записи в UI (после `evt: 'blob'`). */
export interface RecordingResult {
  readonly blob: Blob;
  readonly objectUrl: string;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly sizeBytes: number;
}

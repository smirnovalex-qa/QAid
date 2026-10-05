/**
 * Переиспользуемые фикстуры для чистых тестов ядра «Запись экрана» (TASK-037).
 * Здесь только лёгкие хелперы над seam-ами (`isTypeSupported`) и общие константы —
 * никакого DOM/медиа (инвариант чистоты `logic.ts`).
 */
import { MIME_PREFERENCES } from '@/features/screen-recording/types';
import type { RecordingState } from '@/features/screen-recording/types';

/**
 * Строит предикат-seam над `MediaRecorder.isTypeSupported`: возвращает `true` только
 * для MIME из белого списка `supported`. Сравнение точное (по строке кодека).
 */
export function makeIsSupported(supported: readonly string[]): (mime: string) => boolean {
  const set = new Set(supported);
  return (mime) => set.has(mime);
}

/** Seam, поддерживающий любой MIME (первый из `MIME_PREFERENCES` должен победить). */
export const supportsEverything = (): boolean => true;

/** Seam, не поддерживающий ничего (кодек не найден → `pickMimeType` вернёт `null`). */
export const supportsNothing = (): boolean => false;

/** Самый предпочитаемый кодек (VP9/Opus) — первый в `MIME_PREFERENCES`. */
export const TOP_MIME: string = MIME_PREFERENCES[0]!;

/** Наименее предпочитаемый кодек (голый `video/webm`) — последний в списке. */
export const FALLBACK_MIME: string = MIME_PREFERENCES[MIME_PREFERENCES.length - 1]!;

/** Все семь состояний машины записи — для полного перебора производных в тестах. */
export const ALL_STATES: readonly RecordingState[] = [
  'idle',
  'requesting',
  'recording',
  'paused',
  'finalizing',
  'ready',
  'error',
];

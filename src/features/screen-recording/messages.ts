/**
 * RPC-контракты фичи «Запись экрана» (TASK-037). Адресат — `background`: поднять
 * offscreen-документ (`MediaRecorder` в SW отсутствует) и переключить бейдж-индикатор
 * — операции, доступные только из service worker'а. UI шлёт эти два запроса на шину;
 * сам поток управления рекордером (start/stop/pause/resume) и доставка `Blob` идут по
 * `BroadcastChannel` (ADR-0045), а не по этой шине.
 *
 * **Добыча источника видео в контракт НЕ входит.** Видео целиком захватывает сам
 * offscreen через `getDisplayMedia` (нативный пикер «Выберите, чем поделиться» при каждом
 * старте = согласие). С ревизии 2026-09-21 (bugfix 4) вкладочный `tabCapture`-путь удалён,
 * поэтому UI больше не добывает `streamId` — параметры сессии идут по `BroadcastChannel`.
 *
 * Валидация zod — на границе роутера. Контракт узкий: `start` только готовит контекст,
 * `finalize` снимает бейдж и закрывает offscreen.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/**
 * `screenrec/start` — привилегированная подготовка записи: гарантировать единственный
 * offscreen-документ (`MediaRecorder` в SW отсутствует) и включить бейдж-индикатор.
 * `streamId` здесь НЕ добывается (см. заголовок модуля) — его целиком берёт UI под
 * кликом. Запрос без полей; сбой подготовки → `ok:false` + `reason` (UI показывает
 * причину, а не крэш).
 */
export const ScreenRecStart = defineMessage(
  'screenrec/start',
  z.object({}),
  z.object({
    ok: z.boolean(),
    reason: z.string().optional(),
  }),
);

/**
 * `screenrec/finalize` — запись завершена (UI получил `Blob` по `BroadcastChannel`
 * либо отменил): снять бейдж и закрыть offscreen-документ. Идемпотентно.
 */
export const ScreenRecFinalize = defineMessage(
  'screenrec/finalize',
  z.object({}),
  z.object({ ok: z.literal(true) }),
);

/** Все контракты фичи — для дескриптора (`FeatureModule.messages`). */
export const screenRecordingMessages = [ScreenRecStart, ScreenRecFinalize];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'screenrec/start': {
      request: z.infer<typeof ScreenRecStart.request>;
      response: z.infer<typeof ScreenRecStart.response>;
    };
    'screenrec/finalize': {
      request: z.infer<typeof ScreenRecFinalize.request>;
      response: z.infer<typeof ScreenRecFinalize.response>;
    };
  }
}

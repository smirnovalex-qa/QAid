/**
 * Фоновые (service worker) хендлеры фичи «Запись экрана» (TASK-037, ADR-0045).
 *
 * Здесь живут ТОЛЬКО привилегированные операции, у которых нет UI-контекста: поднять
 * единственный offscreen-документ (`MediaRecorder` в SW отсутствует) и переключить
 * бейдж-индикатор записи. **Источник видео здесь НЕ добывается** (ADR-0045): его целиком
 * захватывает сам offscreen через `getDisplayMedia` (offscreen reason `DISPLAY_MEDIA`;
 * нативный пикер поверхности при каждом старте = согласие). С ревизии 2026-09-21 (bugfix 4)
 * вкладочный `tabCapture`-путь удалён — флоу один, право `tabCapture` больше не нужно.
 *
 * Сам `MediaStream` границу контекста НЕ пересекает — управление рекордером и доставка
 * `Blob` идут по `BroadcastChannel`, а не через `chrome.runtime`. Прямой `chrome.*` вне
 * платформы запрещён (ADR-0014) — всё через `@/platform`. Хендлеры никогда не бросают:
 * сбой подготовки → `ok:false` + причина (UI показывает причину, а не крэш).
 */
import type { BackgroundHandler } from '@/features/registry';
import type { ResponseOf } from '@/shared/messaging/contract';
import { action, offscreen, runtime } from '@/platform';
import type { OffscreenReason } from '@/platform';
import { logger } from '@/shared/logger';

/**
 * Причины создания offscreen-документа — доменный union `OffscreenReason` платформы
 * (приведение к `chrome.offscreen.Reason` инкапсулировано в seam, ADR-0014). Запись
 * экрана взаимодействует и с `getDisplayMedia` (`DISPLAY_MEDIA`: экран/окно/вкладка прямо
 * в offscreen), и с `getUserMedia` (`USER_MEDIA`: микрофон) — нужны обе причины.
 */
const OFFSCREEN_REASONS: OffscreenReason[] = ['USER_MEDIA', 'DISPLAY_MEDIA'];

/** Абсолютный путь к offscreen-документу-хосту рекордера (упакованный ресурс). */
const OFFSCREEN_URL_PATH = 'src/offscreen/index.html';

/** Цвет бейджа «идёт запись» (красный, как REC-индикатор). */
const BADGE_COLOR = '#e5484d';

/**
 * `screenrec/start` — привилегированная подготовка записи: гарантировать единственный
 * offscreen-документ (хост `MediaRecorder`) и включить бейдж-индикатор. `streamId`
 * здесь не добывается — его целиком берёт UI под кликом (см. заголовок модуля). Операция
 * идемпотентна: повторный `ensure` не создаёт второй документ.
 */
async function start(): Promise<ResponseOf<'screenrec/start'>> {
  try {
    await offscreen.ensure({
      url: runtime.getURL(OFFSCREEN_URL_PATH),
      reasons: OFFSCREEN_REASONS,
      justification: 'Record tab/screen with audio via MediaRecorder (offscreen).',
    });

    await action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await action.setBadgeText({ text: 'REC' });

    return { ok: true };
  } catch (e) {
    logger.error('screenrec.start', e);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * `screenrec/finalize` — запись завершена (UI получил `Blob` или отменил): снять бейдж
 * и закрыть offscreen-документ. Идемпотентно и best-effort: любой сбой логируется, но
 * ответ всегда `{ ok: true }` (снятие индикатора не должно уметь «провалиться» для UI).
 */
async function finalize(): Promise<ResponseOf<'screenrec/finalize'>> {
  try {
    await action.setBadgeText({ text: '' });
    await offscreen.close();
  } catch (e) {
    logger.error('screenrec.finalize', e);
  }
  return { ok: true };
}

/**
 * Доменные хендлеры фичи. Подключаются в SW из background-барели
 * (`@/features/background` → `registerBackground`, ADR-0047); вход уже провалидирован
 * zod в роутере.
 */
export const screenRecordingHandlers: BackgroundHandler[] = [
  { type: 'screenrec/start', handler: () => start() },
  { type: 'screenrec/finalize', handler: () => finalize() },
];

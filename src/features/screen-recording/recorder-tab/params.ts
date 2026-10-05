/**
 * Чистые помощники параметров вкладки-рекордера (TASK-037, bugfix 6).
 *
 * Вынесены отдельно от `controller.ts`, чтобы сама вкладка-рекордер (её скрипт) тянула
 * только парсинг query и НЕ импортировала платформенный seam (а с ним webext-polyfill) —
 * страница остаётся лёгкой. `controller.ts` (сторона side panel) переиспользует эти же
 * помощники для сборки URL.
 */
import type { SessionStartParams } from '../session';

/**
 * Путь к странице вкладки-рекордера (упакованный ресурс; в манифесте не декларируется,
 * открывается по URL — потому добавлен явным входом сборки в `vite.config.ts`).
 */
export const RECORDER_TAB_PATH = 'src/features/screen-recording/recorder-tab/index.html';

/** Собирает query-строку с параметрами сессии (race-free доставка во вкладку через URL). */
export function recorderTabQuery(params: SessionStartParams): string {
  return new URLSearchParams({
    sys: params.systemAudio ? '1' : '0',
    mic: params.mic ? '1' : '0',
    max: String(params.maxDurationMs),
  }).toString();
}

/** Разбирает параметры сессии из query вкладки-рекордера (сторона вкладки). */
export function parseRecorderTabParams(search: string): SessionStartParams {
  const q = new URLSearchParams(search);
  const maxRaw = Number.parseInt(q.get('max') ?? '', 10);
  return {
    systemAudio: q.get('sys') === '1',
    mic: q.get('mic') === '1',
    maxDurationMs: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 300_000,
  };
}

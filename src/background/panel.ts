/**
 * Фоновый инъектор откреплённой плавающей панели (TASK-062, ADR-0053).
 *
 * Единственный доменный хендлер — `floating-panel/open`: под пользовательским жестом (из
 * хедера popup/side panel) инъектирует самодостаточную content-обёртку панели в целевую
 * вкладку через обобщённый `ensureContentScript` (`background/inject.ts`). Дальше обёртка
 * автономна: монтирует closed-Shadow-DOM хост, drag-handle, iframe тела панели и persist —
 * фону больше нечего делать. Тело панели (iframe — extension-контекст) ходит к background
 * тем же `chrome.runtime`-bus, что popup/side panel, поэтому отдельного content-RPC к
 * обёртке не нужно.
 *
 * Идемпотентность — guard-флаг `window.__qatb_panel__` в самом бандле (повторная инъекция
 * разворачивает/поднимает существующую панель, не плодит второй экземпляр), поэтому
 * `ping`-проба здесь не нужна (`spec.pingType` не задан: у обёртки нет runtime-роутера,
 * чтобы не конфликтовать со вторым роутером инспекции в том же isolated-world).
 */
import type { BackgroundHandler } from '@/features/registry';
import type { RequestOf } from '@/shared/messaging/contract';
import { AppErrorException } from '@/shared/errors';
import { ensureContentScript } from './inject';
import type { ContentScriptSpec, InjectDeps } from './inject';

/**
 * Стабильное имя собранного бандла content-обёртки панели в `dist/` (совпадает с выходом
 * `scripts/build-content.mjs`). Используется и инъектором, и — при желании — диагностикой.
 */
export const PANEL_CONTENT_SCRIPT = 'content-panel.js';

/**
 * Спецификация инъекции обёртки панели: имя бандла без ping'а — идемпотентность обеспечивает
 * guard-флаг бандла (у обёртки нет runtime-роутера для ответа на ping).
 */
const PANEL_SPEC: ContentScriptSpec = { file: PANEL_CONTENT_SCRIPT };

/**
 * `floating-panel/open` — инъектировать обёртку плавающей панели в вкладку. Отказ инъекции
 * (служебная страница / нет host-доступа) пробрасывается типизированным `AppErrorException`,
 * чтобы роутер донёс `AppError`+`messageKey` до UI (тост «панель недоступна на этой странице»).
 */
async function open(
  req: RequestOf<'floating-panel/open'>,
  deps: InjectDeps = {},
): Promise<{ ok: true }> {
  const ensured = await ensureContentScript(req.tabId, PANEL_SPEC, deps);
  if (!ensured.ok) throw new AppErrorException(ensured.error);
  return { ok: true };
}

/**
 * Доменные хендлеры панели. Подключаются в SW из background-барели
 * (`@/features/background` → `registerBackground`, ADR-0047); вход уже провалидирован zod.
 * `deps` оставлен параметром `open` для юнит-тестов (фейковый `scripting`); боевой вызов —
 * без зависимостей (платформенный seam по умолчанию).
 */
export const floatingPanelBackgroundHandlers: BackgroundHandler[] = [
  { type: 'floating-panel/open', handler: (req) => open(req as RequestOf<'floating-panel/open'>) },
];

/** Экспорт для юнит-тестирования инъектора с подменённым `scripting`-seam. */
export { open as openFloatingPanel };

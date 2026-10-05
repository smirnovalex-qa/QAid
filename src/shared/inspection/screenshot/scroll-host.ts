/**
 * Content-хост управляемой прокрутки для склейки полной страницы (TASK-027).
 *
 * Живёт в `shared/inspection/screenshot` (а НЕ в `features/`), т.к. попадает в
 * инспекционный content-бандл, который не должен импортировать фичи. Использует
 * только DOM-глобалы страницы (`window`/`document`); `chrome.*`/`@platform` не
 * трогает — обмен идёт через `registerHandler` шины. Свой роутер НЕ поднимает — его
 * ставит `installInspectionHost` (канон хостов storage/forms/measure, TASK-013);
 * здесь только регистрация доменных хендлеров `screenshot/*`.
 *
 * Импорт `./messages` (side-effect) кладёт zod-схемы в реестр content-реалма —
 * иначе роутер не провалидирует входящий запрос.
 */
import './messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf } from '@/shared/messaging/contract';

/** Снимок метрик страницы. */
interface PageMetrics {
  viewportW: number;
  viewportH: number;
  docH: number;
  dpr: number;
}

/** Исходная прокрутка окна на момент начала склейки (для `reset`). */
let originalScrollX = 0;
let originalScrollY = 0;
/** Запомнена ли исходная прокрутка (первый `metrics`/`scrollStep` серии). */
let baselineSaved = false;

/** Полная высота документа (учитывает и `documentElement`, и `body`). */
function documentHeight(): number {
  const el = document.documentElement;
  return Math.max(el.scrollHeight, document.body.scrollHeight, el.clientHeight);
}

/** Текущие метрики страницы (device-aware DPR с защитой от 0). */
function readMetrics(): PageMetrics {
  const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  return {
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    docH: documentHeight(),
    dpr,
  };
}

/** Запоминает исходную прокрутку один раз на серию склейки. */
function saveBaseline(): void {
  if (baselineSaved) return;
  originalScrollX = window.scrollX;
  originalScrollY = window.scrollY;
  baselineSaved = true;
}

function metrics(): Promise<PageMetrics> {
  saveBaseline();
  return Promise.resolve(readMetrics());
}

function scrollStep(
  req: RequestOf<'screenshot/scrollStep'>,
): Promise<PageMetrics & { scrollY: number }> {
  saveBaseline();
  window.scrollTo(0, req.scrollY);
  // Возвращаем ФАКТИЧЕСКУЮ прокрутку: браузер мог зажать до `docH - viewportH`.
  return Promise.resolve({ ...readMetrics(), scrollY: window.scrollY });
}

function reset(): Promise<{ ok: true }> {
  window.scrollTo(originalScrollX, originalScrollY);
  baselineSaved = false;
  return Promise.resolve({ ok: true as const });
}

/**
 * Хендлеры склейки — экспортируются для прямого юнит-тестирования (без runtime):
 * те же функции регистрируются в шине из `installScreenshotScrollHost`.
 */
export const screenshotScrollHandlers = { metrics, scrollStep, reset };

/** Установлен ли хост (шина не умеет разрегистрировать — защита от повтора). */
let installed = false;

/**
 * Регистрирует хендлеры `screenshot/*` в шине content-реалма. Идемпотентно:
 * повторная инъекция бандла не перерегистрирует (`registerHandler` бросает на
 * дубликат). Роутер поднимает соседний инспекционный хост — здесь не дублируется.
 * Вызывается оркестратором в content-бандле (`content/inspection/index.ts`).
 */
export function installScreenshotScrollHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('screenshot/metrics', metrics);
  registerHandler('screenshot/scrollStep', scrollStep);
  registerHandler('screenshot/reset', reset);
}

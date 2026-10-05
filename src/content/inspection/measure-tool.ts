/**
 * Интерактивная свободная линейка (drag-измеритель) инспекционного слоя (TASK-033) —
 * добор к TASK-018. Живёт в content-бандле инспекции (ISOLATED world), регистрирует
 * свои хендлеры `inspection/measure` / `inspection/measureStop` в общей шине через
 * `registerHandler`; СВОЙ роутер не поднимает — его ставит `installInspectionHost`
 * (канон хостов storage/forms/dom-override, TASK-013).
 *
 * Инвариант TASK-013: инструмент НЕ мутирует DOM страницы — мерка/направляющие
 * рисуются в собственном закрытом Shadow-DOM оверлее (как `overlay.ts`), стили только
 * инлайн (CSP-safe). Слушатели вешаются в фазе перехвата на `document` и полностью
 * снимаются при завершении (клик-drag завершён, `Esc`, `measureStop`, вытеснение
 * новым запуском, `pagehide`), поэтому страница/инструмент не «залипают».
 *
 * Геометрия — из готовой `shared/inspection/ruler/logic` (`measureVector`), snap — из
 * чистой `shared/inspection/ruler/snap`. Кромки для примагничивания собираются ОДИН
 * раз на старт drag (с бюджетом узлов, перф §9), а не на каждый `mousemove`.
 */
import '@/shared/inspection/messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf } from '@/shared/messaging/contract';
import { measureVector } from '@/shared/inspection/ruler/logic';
import { collectEdges, snapPoint } from '@/shared/inspection/ruler/snap';
import type { EdgeCandidates } from '@/shared/inspection/ruler/snap';
import type { DragMeasurement, Point, Rect } from '@/shared/inspection/ruler/types';
import { OVERLAY_HOST_ATTR } from './overlay';

/** Максимальный z-index — оверлей мерки поверх любого содержимого страницы. */
const MAX_Z_INDEX = '2147483647';
/** Бюджет узлов при сборе кромок для snap (перф §9: до ~10k узлов без лага). */
const EDGE_BUDGET = 4000;

/** Ответ `inspection/measure`: концы мерки и измерение, либо `null` (отмена). */
type MeasureResult = { a: Point; b: Point; measurement: DragMeasurement } | null;

/** Активная сессия измерения (single-flight): позволяет отменить её извне. */
let activeSession: { cancel: () => void } | null = null;

/** Отменяет активную сессию (резолвит её `null`) и забывает ссылку. */
function cancelActive(): void {
  const session = activeSession;
  if (session) {
    activeSession = null;
    session.cancel();
  }
}

/** Собственный визуальный оверлей мерки (закрытый Shadow-DOM, pointer-events: none). */
interface MeasureOverlay {
  readonly host: HTMLElement;
  draw(a: Point, b: Point): void;
  destroy(): void;
}

/** Создаёт закрытый Shadow-DOM оверлей: отрезок A→B, bbox, направляющие и подпись. */
function createMeasureOverlay(doc: Document): MeasureOverlay {
  const host = doc.createElement('div');
  host.setAttribute(OVERLAY_HOST_ATTR, '');
  host.style.cssText = `position: fixed; inset: 0; margin: 0; padding: 0; border: 0; pointer-events: none; z-index: ${MAX_Z_INDEX};`;
  const shadow = host.attachShadow({ mode: 'closed' });

  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'all: initial;';

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = `position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; overflow: visible;`;

  const box = doc.createElementNS(svgNs, 'rect');
  box.setAttribute('fill', 'rgba(47, 129, 247, 0.12)');
  box.setAttribute('stroke', '#2f81f7');
  box.setAttribute('stroke-width', '1');
  const line = doc.createElementNS(svgNs, 'line');
  line.setAttribute('stroke', '#2f81f7');
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(box);
  svg.appendChild(line);

  const label = doc.createElement('div');
  label.style.cssText = `position: fixed; padding: 2px 6px; font: 11px/1.4 ui-monospace, monospace; color: #fff; background: #2f81f7; border-radius: 3px; white-space: nowrap; pointer-events: none; transform: translate(8px, 8px);`;

  wrapper.appendChild(svg);
  wrapper.appendChild(label);
  shadow.appendChild(wrapper);
  doc.documentElement.appendChild(host);

  return {
    host,
    draw(a, b) {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const m = measureVector(a, b);
      box.setAttribute('x', String(x));
      box.setAttribute('y', String(y));
      box.setAttribute('width', String(m.width));
      box.setAttribute('height', String(m.height));
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      label.textContent = `${String(m.length)}px · ${String(m.width)}×${String(m.height)} · ${String(m.angleDeg)}°`;
      label.style.left = `${String(b.x)}px`;
      label.style.top = `${String(b.y)}px`;
    },
    destroy() {
      host.remove();
    },
  };
}

/**
 * Собирает кромки видимых элементов для snap (один раз на старт drag). Обходит
 * `document.body` с бюджетом узлов, исключая собственный оверлей; берёт только
 * элементы с ненулевой рамкой, попадающей в вьюпорт. Пустой набор — snap просто не
 * сработает (мерка идёт по «сырым» координатам).
 */
function collectViewportEdges(doc: Document): EdgeCandidates {
  const rects: Rect[] = [];
  // `document.body` трактуем как присутствующий (хост инъектируется после готовности
  // DOM — тот же инвариант, что в `host.ts` `scan`).
  const all = doc.body.querySelectorAll('*');
  const vw = doc.defaultView?.innerWidth ?? 0;
  const vh = doc.defaultView?.innerHeight ?? 0;
  let seen = 0;
  for (const el of all) {
    if (seen >= EDGE_BUDGET) break;
    seen += 1;
    if (el.closest(`[${OVERLAY_HOST_ATTR}]`)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    // Отсекаем то, что целиком за пределами вьюпорта (кромки не видны — snap не нужен).
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    rects.push({ x: r.x, y: r.y, width: r.width, height: r.height });
  }
  return collectEdges(rects);
}

/** Запускает интерактивное измерение; резолвится по завершении drag или отмене. */
function measure(req: RequestOf<'inspection/measure'>): Promise<MeasureResult> {
  // Single-flight: вытесняем прежнюю сессию (резолвит её `null`), чтобы не копить
  // оверлеи/слушатели и не запускать вторую линейку поверх первой.
  cancelActive();

  const doc = document;
  const root = doc.documentElement;
  const overlay = createMeasureOverlay(doc);
  const useSnap = req.snap && req.snapThreshold > 0;

  return new Promise<MeasureResult>((resolve) => {
    let settled = false;
    let dragging = false;
    let anchor: Point | null = null;
    let edges: EdgeCandidates = { xs: [], ys: [] };

    const previousCursor = root.style.cursor;
    const previousUserSelect = root.style.userSelect;

    const finish = (result: MeasureResult): void => {
      if (settled) return;
      settled = true;
      doc.removeEventListener('mousedown', onMouseDown, true);
      doc.removeEventListener('mousemove', onMouseMove, true);
      doc.removeEventListener('mouseup', onMouseUp, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pagehide', onPageHide);
      root.style.cursor = previousCursor;
      root.style.userSelect = previousUserSelect;
      overlay.destroy();
      if (activeSession === session) activeSession = null;
      resolve(result);
    };

    const pointFrom = (event: MouseEvent): Point => {
      const raw: Point = { x: event.clientX, y: event.clientY };
      if (!useSnap) return raw;
      return snapPoint(raw, edges, req.snapThreshold).point;
    };

    function onMouseDown(event: MouseEvent): void {
      if (dragging) return;
      event.preventDefault();
      event.stopPropagation();
      // Кромки для snap собираем один раз на старт drag (перф §9), не на каждый move.
      if (useSnap) edges = collectViewportEdges(doc);
      anchor = pointFrom(event);
      dragging = true;
      overlay.draw(anchor, anchor);
    }

    function onMouseMove(event: MouseEvent): void {
      if (!dragging || anchor === null) return;
      event.preventDefault();
      overlay.draw(anchor, pointFrom(event));
    }

    function onMouseUp(event: MouseEvent): void {
      if (!dragging || anchor === null) return;
      event.preventDefault();
      event.stopPropagation();
      const b = pointFrom(event);
      finish({ a: anchor, b, measurement: measureVector(anchor, b) });
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    }

    function onPageHide(): void {
      finish(null);
    }

    const session = {
      cancel: (): void => {
        finish(null);
      },
    };
    activeSession = session;

    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('mouseup', onMouseUp, true);
    doc.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pagehide', onPageHide);
    root.style.cursor = 'crosshair';
    root.style.userSelect = 'none';
  });
}

/**
 * Отменяет активную линейку из панели (`measure` резолвится `null`). Тело запроса
 * (`tabId`) не нужно — состояние линейки одно на content-реалм; шина передаст req,
 * хендлер его игнорирует (меньшая арность допустима).
 */
function measureStop(): Promise<{ ok: true }> {
  cancelActive();
  return Promise.resolve({ ok: true as const });
}

/** Хендлеры свободной линейки — экспортируются для прямого юнит-тестирования. */
export const measureHandlers = { measure, measureStop };

/**
 * Регистрирует хендлеры свободной линейки в шине. Роутер НЕ поднимает — его ставит
 * `installInspectionHost()`. Вызывается оркестратором в content-бандле до установки
 * инспекционного хоста (как прочие content-хосты).
 */
export function installMeasureToolHost(): void {
  registerHandler('inspection/measure', measure);
  registerHandler('inspection/measureStop', measureStop);
}

/**
 * Content-хост инспекционного слоя (TASK-013): приёмник инспекционных сообщений,
 * реестр инспекторов-сборщиков и teardown.
 *
 * Хост регистрирует хендлеры `inspection/*` в шине (`registerHandler`) и ставит
 * роутер (`installRouter`, канал по умолчанию — runtimeTransport). `pick` поднимает
 * общий пикер + оверлей и запоминает выбранный элемент как «якорь»; `collect`
 * запускает именованный сборщик на этом якоре. DOM-узлы наружу не ходят —
 * возвращается сериализуемый снимок (`toPickedElement`).
 *
 * Импорт `messages` — ради регистрации zod-контрактов и declaration merging
 * (без него типы `inspection/*` не видны шине).
 */
import '@/shared/inspection/messages';
import type {
  CollectResult,
  InspectorCollector,
  InspectorId,
  NavigationState,
  PickedElement,
} from '@/shared/inspection/types';
import type { RequestOf, ResponseOf } from '@/shared/messaging/contract';
import { registerHandler, installRouter } from '@/shared/messaging/bus';
import { appError, AppErrorException } from '@/shared/errors';
import { navigationState, resolveStep } from '@/shared/inspection/navigation';
import { IGNORED_UI_SELECTOR } from '@/shared/inspection/dom';
import type { Overlay } from './overlay';
import { createOverlay } from './overlay';
import { startPicker } from './picker';

/** Реестр инспекторов: id → сборщик. */
const inspectors = new Map<InspectorId, InspectorCollector>();

/** Последний выбранный элемент («якорь» пикера) для последующего `collect`. */
let lastPicked: Element | null = null;

/** Оверлей создаётся лениво (при первом `pick`) и уничтожается на teardown. */
let overlay: Overlay | null = null;

/**
 * Контроллер текущего незавершённого выбора (single-flight). Позволяет отменить
 * «висячий» пикер: при новом `pick`, `teardown` или `pagehide` — чтобы не копить
 * перехватчики кликов на странице и не «залипать» на прошлом выборе.
 */
let activePick: AbortController | null = null;

/**
 * Персистентная сессия живого режима инспекции (TASK-056). Монтируется один раз и
 * переиспользуется между кликами (см. {@link startLiveSession}); `null` — режим выключен.
 */
let live: LiveSession | null = null;

/** Отменяет активный выбор (снимает слушатели пикера через его AbortSignal). */
function cancelActivePick(): void {
  if (activePick) {
    activePick.abort();
    activePick = null;
  }
}

/**
 * Регистрирует сборщик под уникальным id. Дубликат — ошибка (инвариант
 * уникальности, как в `registerHandler`). Сброс — через `clearInspectors`.
 */
export function registerInspector(id: InspectorId, collector: InspectorCollector): void {
  if (inspectors.has(id)) throw new Error(`duplicate inspector: ${id}`);
  inspectors.set(id, collector);
}

/** Очищает реестр инспекторов (для тестов и teardown хоста). */
export function clearInspectors(): void {
  inspectors.clear();
}

/** Строит сериализуемый снимок элемента (DOM-узел наружу не отдаём). */
export function toPickedElement(el: Element): PickedElement {
  const id = el.getAttribute('id');
  const classNames = Array.from(el.classList);
  const tagName = el.tagName.toLowerCase();
  const selector = tagName + (id ? `#${id}` : '') + classNames.map((cls) => `.${cls}`).join('');
  const r = el.getBoundingClientRect();
  return {
    tagName,
    id,
    classNames,
    selector,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
  };
}

function ensureOverlay(): Overlay {
  overlay ??= createOverlay();
  return overlay;
}

/** Тип ответа пикера (снимок узла + navigation-состояние; TASK-052). */
type PickResponse = ResponseOf<'inspection/pick'>;

/** Строит расширенный ответ пикера: снимок узла + его navigation-состояние. */
function toPickResponse(el: Element): NonNullable<PickResponse> {
  const state = navigationState(el);
  return { ...state.node, navigation: state };
}

/**
 * Значимая цель события: `Element`, не входящий в собственные UI-хосты расширения
 * (оверлей инспектора и плавающую панель, `[data-qatb-overlay]`/`[data-qatb-panel]`).
 * Локальная копия хелпера пикера (`targetElement` в picker.ts не экспортируется) — чтобы
 * живой режим применял ту же логику исключения, что и одноразовый `pick`. Единый источник
 * селектора — `dom.ts` ({@link IGNORED_UI_SELECTOR}).
 */
function targetOf(event: Event): Element | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (target.closest(IGNORED_UI_SELECTOR)) return null;
  return target;
}

/**
 * Персистентная сессия живого режима инспекции (TASK-056, ADR-0050). В отличие от
 * одноразового пикера, монтируется ОДИН раз и переиспользуется между кликами: оверлей,
 * `cursor: crosshair` и слушатели держатся до `stop()`, а панель лишь пере-вооружает
 * резолвер очередного клика (`arm`) — без ремонтажа оверлея (нет flicker).
 */
interface LiveSession {
  /**
   * Вооружить резолвер на СЛЕДУЮЩИЙ клик. Если клик был буферизован (пришёл между
   * резолвом прошлого `pickLive` и пере-вооружением) — резолвит немедленно им. Если
   * резолвер уже вооружён (в норме не бывает) — прежний резолвится `null`.
   */
  arm(resolve: (v: PickResponse) => void): void;
  /**
   * Остановить: снять слушатели, вернуть курсор, погасить hover-бокс; locked-бокс,
   * `lastPicked` и оверлей СОХРАНЯЮТСЯ (чтобы навигация степпером работала после выхода
   * из live). Вооружённый резолвер (если есть) резолвит `null`. Идемпотентно. Обнуляет
   * модульный `live`, если это именно данная сессия.
   */
  stop(): void;
}

/**
 * Поднимает персистентную сессию живого режима: монтирует оверлей (если ещё нет), ставит
 * `cursor: crosshair` и слушатели в фазе перехвата на `document`. `mousemove` рисует
 * hover-бокс под курсором; `click` блокирует переход по странице, двигает `lastPicked` на
 * кликнутый узел, рисует locked-бокс и резолвит вооружённый `pickLive` (или буферизует узел
 * до следующего `arm`, чтобы быстрый повторный клик не потерялся); `Esc` — выход из режима.
 */
function startLiveSession(): LiveSession {
  const ov = ensureOverlay();
  const root = document.documentElement;
  const previousCursor = root.style.cursor;

  let armed: ((v: PickResponse) => void) | null = null;
  let buffered: Element | null = null;
  let stopped = false;

  const resolveArmed = (value: PickResponse): void => {
    if (armed === null) return;
    const resolve = armed;
    armed = null;
    resolve(value);
  };

  function onMouseMove(event: Event): void {
    const el = targetOf(event);
    if (el) ov.highlight(el.getBoundingClientRect(), 'hover');
  }

  function onClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const el = targetOf(event);
    if (el === null) return;
    lastPicked = el;
    ov.highlight(el.getBoundingClientRect(), 'locked');
    ov.clear('hover');
    if (armed === null) {
      // Резолвер ещё не пере-вооружён — не теряем клик, отдадим его следующему `arm`.
      buffered = el;
    } else {
      resolveArmed(toPickResponse(el));
    }
  }

  function arm(resolve: (v: PickResponse) => void): void {
    // Уже вооружён (в норме не случается) — прежний резолвим null, не теряя его.
    if (armed !== null) resolveArmed(null);
    if (buffered !== null) {
      const el = buffered;
      buffered = null;
      resolve(toPickResponse(el));
      return;
    }
    armed = resolve;
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    root.style.cursor = previousCursor;
    ov.clear('hover');
    resolveArmed(null);
    // Обнуляем модульный указатель только если он всё ещё на этой сессии.
    if (live === session) live = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stop(); // `Esc` — выход из живого режима (резолвит вооружённый `pickLive` в `null`).
    }
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  root.style.cursor = 'crosshair';

  const session: LiveSession = { arm, stop };
  return session;
}

/**
 * Подсвечивает якорь в оверлее и скроллит его в вид. Вынесено из `highlight`, чтобы
 * навигация перерисовывала подсветку тем же способом. `scrollIntoView` есть не во всех
 * средах (jsdom/эмбеды) — вызываем по наличию.
 */
function highlightAnchor(el: Element): void {
  ensureOverlay().highlight(el.getBoundingClientRect());
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }
}

/**
 * Ближайший всё ещё присоединённый к документу предок (SPA-фолбэк): узел мог быть
 * удалён из DOM между шагами. Возвращает `null`, если живого предка нет.
 */
function nearestConnectedAncestor(el: Element): Element | null {
  let node: Element | null = el.parentElement;
  while (node !== null) {
    if (node.isConnected) return node;
    node = node.parentElement;
  }
  return null;
}

function ping(): Promise<{ ready: true }> {
  return Promise.resolve({ ready: true as const });
}

async function pick(): Promise<PickResponse> {
  // Живой режим и одноразовый пикер не должны бороться за слушатели — гасим live.
  live?.stop();
  // Single-flight: прерываем предыдущий незавершённый выбор, чтобы не оставить на
  // странице перехватчики кликов и не запускать второй пикер поверх первого.
  cancelActivePick();
  const controller = new AbortController();
  activePick = controller;

  try {
    const ov = ensureOverlay();
    const el = await startPicker({
      signal: controller.signal,
      onHover: (target) => {
        ov.highlight(target.getBoundingClientRect());
      },
    });

    // Этот выбор вытеснен более новым `pick` — не трогаем общий стейт/оверлей.
    if (activePick !== controller) return el ? toPickResponse(el) : null;

    ov.clear();
    lastPicked = el;
    return el ? toPickResponse(el) : null;
  } finally {
    // Освобождаем контроллер только если он всё ещё наш (не вытеснен новым).
    if (activePick === controller) activePick = null;
  }
}

/**
 * Живой режим инспекции курсором (TASK-056, ADR-0050): резолвится снимком узла на
 * ОЧЕРЕДНОМ клике, попутно двигая `lastPicked` на него. Сессия персистентна — оверлей
 * монтируется один раз и переиспользуется между вызовами (нет flicker). `Esc`/`pickLiveStop`/
 * `teardown`/`pagehide` резолвят `null`. Одноразовый пикер здесь не запускается — гасим его.
 */
function pickLive(): Promise<PickResponse> {
  // Никогда не держим одноразовый пикер параллельно с живым режимом.
  cancelActivePick();
  return new Promise<PickResponse>((resolve) => {
    live ??= startLiveSession();
    live.arm(resolve);
  });
}

/**
 * Выход из живого режима из панели (TASK-056): останавливает персистентную сессию
 * (ожидающий `pickLive` резолвит `null`), но оверлей и `lastPicked` сохраняются — степпер
 * `HierarchyNav` продолжает работать. Идемпотентно (нет сессии → просто `{ ok: true }`).
 */
function pickLiveStop(): Promise<{ ok: true }> {
  live?.stop();
  return Promise.resolve({ ok: true as const });
}

/**
 * Навигация по DOM-иерархии текущего якоря (TASK-052, ADR-0049). Stateful-команда:
 * двигает `lastPicked` по `resolveStep`, перерисовывает подсветку/скролл на новый узел
 * и возвращает снимок нового состояния. Деградация без исключений:
 *  - нет якоря → `null`;
 *  - якорь «умер» (SPA-перерисовка, узел вне `document`) → фолбэк к ближайшему живому
 *    предку (или `null`, если его нет) без применения шага;
 *  - шаг невозможен (нет родителя/детей/соседа) → текущее состояние без смены якоря.
 */
function navigate(req: RequestOf<'inspection/navigate'>): Promise<NavigationState | null> {
  if (!lastPicked) return Promise.resolve(null);

  // SPA-устойчивость: якорь удалён из DOM — деградируем к живому предку, а не падаем.
  if (!lastPicked.isConnected) {
    const alive = nearestConnectedAncestor(lastPicked);
    if (alive === null) {
      lastPicked = null;
      return Promise.resolve(null);
    }
    lastPicked = alive;
    highlightAnchor(alive);
    return Promise.resolve(navigationState(alive));
  }

  const next = resolveStep(lastPicked, req.step, req.depth);
  // Невозможный шаг — идемпотентный no-op: текущее состояние, якорь не меняем.
  if (next === null) return Promise.resolve(navigationState(lastPicked));

  lastPicked = next;
  highlightAnchor(next);
  return Promise.resolve(navigationState(next));
}

/**
 * Прогоняет именованный сборщик на `root` и оборачивает результат. Валидация
 * (`неизвестный сборщик`) — синхронный `throw` до промиса, чтобы роутер получил
 * `AppErrorException` тем же путём, что и раньше. Сам сборщик может быть async —
 * дожидаемся его (`Promise.resolve(...).then`) перед формированием ответа.
 */
function runCollector(inspectorId: InspectorId, root: Element): Promise<CollectResult> {
  const collector = inspectors.get(inspectorId);
  if (!collector) throw new AppErrorException(appError('NO_RECEIVER', 'unknown inspector'));
  return Promise.resolve(collector(root)).then((data) => ({ inspectorId, data }));
}

function collect(req: RequestOf<'inspection/collect'>): Promise<CollectResult> {
  if (!lastPicked) throw new AppErrorException(appError('INTERNAL', 'no picked element'));
  return runCollector(req.inspectorId, lastPicked);
}

/**
 * Страничный скан (`inspection/scan`): корень — `document.body` (оверлей висит на
 * `<html>`, вне `<body>`, поэтому в обход не попадает). В отличие от `collect`, не
 * требует выбранного якоря — основной путь для контраста/палитры/шрифтов.
 */
function scan(req: RequestOf<'inspection/scan'>): Promise<CollectResult> {
  return runCollector(req.inspectorId, document.body);
}

/**
 * Подсветка узла по CSS-селектору (`inspection/highlight`): без состояния, находит
 * `querySelector`, скроллит к нему и показывает рамку в оверлее. Невалидный селектор
 * (`SecurityError`/`SyntaxError`) или отсутствие узла — `{ found: false }`, без краха.
 */
function highlight(req: RequestOf<'inspection/highlight'>): Promise<{ found: boolean }> {
  let el: Element | null = null;
  try {
    el = document.querySelector(req.selector);
  } catch {
    el = null; // невалидный селектор — не роняем инструмент
  }
  if (!el) return Promise.resolve({ found: false });
  ensureOverlay().highlight(el.getBoundingClientRect());
  // `scrollIntoView` есть не во всех средах (jsdom/эмбеды) — вызываем по наличию.
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }
  return Promise.resolve({ found: true });
}

function teardown(): Promise<{ ok: true }> {
  live?.stop();
  live = null;
  cancelActivePick();
  overlay?.destroy();
  overlay = null;
  lastPicked = null;
  return Promise.resolve({ ok: true as const });
}

/**
 * Хендлеры инспекционных сообщений. Экспортируются для прямого юнит-тестирования
 * (без полного runtime): те же функции регистрируются в шине из
 * `installInspectionHost`.
 */
export const inspectionHandlers = {
  ping,
  pick,
  pickLive,
  pickLiveStop,
  navigate,
  collect,
  scan,
  highlight,
  teardown,
};

/** Установлен ли хост (шина не умеет разрегистрировать хендлеры — защита от повтора). */
let installed = false;
let currentTeardown: () => void = () => undefined;

/**
 * Поднимает хост: регистрирует хендлеры, ставит роутер и `pagehide`-teardown.
 * Возвращает функцию остановки.
 *
 * Идемпотентно: повторный вызов возвращает уже существующий teardown, не
 * пытаясь перерегистрировать хендлеры (`registerHandler` бросает на дубликат, а
 * разрегистрации в шине нет). Поэтому teardown НЕ сбрасывает флаг `installed` и
 * не снимает хендлеры — только роутер, слушатель `pagehide` и оверлей.
 */
export function installInspectionHost(): () => void {
  if (installed) return currentTeardown;
  installed = true;

  registerHandler('inspection/ping', ping);
  registerHandler('inspection/pick', pick);
  registerHandler('inspection/pickLive', pickLive);
  registerHandler('inspection/pickLiveStop', pickLiveStop);
  registerHandler('inspection/navigate', navigate);
  registerHandler('inspection/collect', collect);
  registerHandler('inspection/scan', scan);
  registerHandler('inspection/highlight', highlight);
  registerHandler('inspection/teardown', teardown);

  const stopRouter = installRouter();
  const onPageHide = (): void => {
    void teardown();
  };
  window.addEventListener('pagehide', onPageHide);

  currentTeardown = (): void => {
    stopRouter();
    window.removeEventListener('pagehide', onPageHide);
    live?.stop();
    live = null;
    cancelActivePick();
    overlay?.destroy();
    overlay = null;
    lastPicked = null;
  };
  return currentTeardown;
}

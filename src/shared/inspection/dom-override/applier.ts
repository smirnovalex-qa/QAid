/**
 * Content-хост «DOM-подмены выделением» (TASK-023). Живёт в shared-слое инспекции
 * (как storage/forms/defects), НЕ в `features/`, и `chrome.*` не трогает — обмен
 * только через шину (`registerHandler`). Регистрируется в общем content-бандле
 * оркестратором (`installDomOverrideContentHost()`); свой роутер НЕ поднимает — его
 * ставит инспекционный хост (`installInspectionHost`, TASK-013).
 *
 * Применение — строго косметическое и строго над ВЫБРАННЫМИ узлами: планировщик
 * (`planApply`) описывает записи в поля выбранного узла, хост снимает снимок прежних
 * значений (для точного отката), пишет и переигрывает подмены по DOM-мутациям через
 * `MutationObserver`. Защита от циклов — наблюдатель отключается на время СОБСТВЕННЫХ
 * записей, поэтому свои мутации в него не попадают. `clear`/teardown полностью
 * восстанавливают DOM. Узлы, которых пользователь не выбирал, не читаются и не пишутся.
 *
 * Переигрывание по чужим мутациям КОАЛЕСИРУЕТСЯ в один `requestAnimationFrame`: все
 * пачки мутаций, пришедшие за кадр, схлопываются в одну реконсиляцию, синхронную с
 * ритмом отрисовки браузера. Иначе на «болтливой» странице (анимации, инкрементальный
 * рендер, ре-рендеры фреймворка) наблюдатель запускал полный проход (`restoreAll` +
 * `querySelector` по каждой записи) на КАЖДУЮ доставку мутаций — лишняя работа и
 * layout-трэшинг. Прямой вызов `apply` реконсилит немедленно (без кадра) — задержка
 * только у реакции на чужие правки. В фоновой вкладке rAF не тикает: реконсиляция
 * отложится до возврата фокуса (для косметики это приемлемо — скрытую вкладку никто
 * не видит, а кадр отработает до первого paint при возврате).
 *
 * Импорт `./messages` (side-effect) регистрирует zod-контракты `domOverride/*` в
 * реестре content-реалма — иначе роутер не провалидирует входящий запрос.
 */
import './messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf } from '@/shared/messaging/contract';
import { planApply, planUndo } from './logic';
import type { DomField, DomWrite } from './logic';
import type { DomOverrideEntry } from './types';

/** Применённая подмена: узел, план записей и снятый снимок прежних значений. */
interface AppliedRecord {
  readonly entry: DomOverrideEntry;
  readonly element: Element;
  readonly writes: readonly DomWrite[];
  readonly previous: readonly (string | null)[];
}

/** Желаемый набор подмен (последний из `apply`) — источник для переигрывания. */
let desired: readonly DomOverrideEntry[] = [];
/** Фактически применённые записи (для отката в обратном порядке). */
let applied: AppliedRecord[] = [];
/** Наблюдатель мутаций (создаётся при первом `apply`, снимается на `clear`). */
let observer: MutationObserver | null = null;
/** Хэндл запланированного кадра переигрывания (rAF-коалесинг) или `null`. */
let replayHandle: number | null = null;

/** Читает текущее значение поля узла как `string | null` (null — пусто/нет атрибута). */
function readField(el: Element, field: DomField): string | null {
  switch (field.kind) {
    case 'text':
      return el.textContent;
    case 'attr':
      return el.getAttribute(field.name);
    case 'style': {
      const value = (el as HTMLElement).style.getPropertyValue(field.prop);
      return value === '' ? null : value;
    }
  }
}

/** Пишет значение в поле узла; `null` — очистить/удалить (снять атрибут/стиль/текст). */
function writeField(el: Element, field: DomField, value: string | null): void {
  switch (field.kind) {
    case 'text':
      el.textContent = value ?? '';
      break;
    case 'attr':
      if (value === null) el.removeAttribute(field.name);
      else el.setAttribute(field.name, value);
      break;
    case 'style': {
      const style = (el as HTMLElement).style;
      if (value === null) style.removeProperty(field.prop);
      else style.setProperty(field.prop, value);
      break;
    }
  }
}

/** Откатывает все применённые подмены в обратном порядке и очищает журнал. */
function restoreAll(): void {
  for (let i = applied.length - 1; i >= 0; i -= 1) {
    const rec = applied[i];
    if (rec === undefined) continue;
    const undo = planUndo(rec.writes, rec.previous);
    for (const w of undo) writeField(rec.element, w.field, w.value);
  }
  applied = [];
}

/**
 * Полная реконсиляция: сперва откатывает прежние подмены (чистый исходный DOM),
 * затем применяет желаемый набор, снимая снимок прежних значений для точного отката.
 * Не найденный/невалидный селектор молча пропускается. Возвращает число применённых.
 * Трогает ТОЛЬКО узлы, найденные по селекторам подмен, — не чужие.
 */
function applyDesired(): number {
  restoreAll();
  const next: AppliedRecord[] = [];
  for (const entry of desired) {
    if (!entry.enabled) continue;
    let el: Element | null;
    try {
      el = document.querySelector(entry.selector);
    } catch {
      el = null; // невалидный селектор — не роняем хост
    }
    if (el === null) continue;
    const target = el;
    const writes = planApply(entry.op);
    const previous = writes.map((w) => readField(target, w.field));
    for (const w of writes) writeField(target, w.field, w.value);
    next.push({ entry, element: target, writes, previous });
  }
  applied = next;
  return applied.length;
}

/** Параметры наблюдения: всё поддерево, узлы/атрибуты/текст. */
const OBSERVE_INIT: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
};

/** (Пере)подключает наблюдатель к корню документа. */
function observeNow(): void {
  observer?.observe(document.documentElement, OBSERVE_INIT);
}

/**
 * Выполняет собственные записи в DOM с отключённым наблюдателем — так наши мутации
 * не попадают в его очередь и не вызывают повторный проход (защита от циклов).
 * `disconnect()` очищает очередь записей, поэтому доставки уже поставленных в очередь
 * СОБСТВЕННЫХ мутаций не будет.
 */
function withPausedObserver<T>(fn: () => T): T {
  observer?.disconnect();
  try {
    return fn();
  } finally {
    observeNow();
  }
}

/**
 * Планирует переигрывание в следующем кадре (`requestAnimationFrame`), схлопывая все
 * мутации кадра в одну реконсиляцию (debounce). Повторные вызовы до кадра
 * дедуплицируются по `replayHandle`. Собственные записи идут при отключённом
 * наблюдателе (`withPausedObserver`), поэтому цикла не возникает.
 */
function scheduleReplay(): void {
  if (replayHandle !== null) return;
  replayHandle = requestAnimationFrame(() => {
    replayHandle = null;
    withPausedObserver(() => {
      applyDesired();
    });
  });
}

/** Снимает запланированный кадр переигрывания (если есть) — для `clear`/teardown. */
function cancelScheduledReplay(): void {
  if (replayHandle === null) return;
  cancelAnimationFrame(replayHandle);
  replayHandle = null;
}

/** Создаёт наблюдатель (идемпотентно), переигрывающий подмены по мутациям. */
function ensureObserver(): void {
  if (observer !== null) return;
  // Коалесим в один кадр: много пачек мутаций за кадр → одна реконсиляция (см.
  // заголовок модуля). Прямой синхронный проход тут запускал бы полный
  // restoreAll + querySelector на каждую доставку мутаций.
  observer = new MutationObserver(scheduleReplay);
  observeNow();
}

function apply(req: RequestOf<'domOverride/apply'>): Promise<{ applied: number }> {
  desired = req.entries;
  ensureObserver();
  const count = withPausedObserver(() => applyDesired());
  return Promise.resolve({ applied: count });
}

function clear(): Promise<{ ok: true }> {
  desired = [];
  cancelScheduledReplay(); // снять отложенный кадр — иначе он переиграл бы после очистки
  withPausedObserver(() => {
    restoreAll();
  });
  observer?.disconnect();
  observer = null;
  return Promise.resolve({ ok: true as const });
}

function list(): Promise<{ selectors: string[] }> {
  return Promise.resolve({ selectors: applied.map((r) => r.entry.selector) });
}

/**
 * Хендлеры — экспортируются для прямого юнит-тестирования (без полного runtime): те
 * же функции регистрируются в шине из `installDomOverrideContentHost`.
 */
export const domOverrideHandlers = { apply, clear, list };

/**
 * Полный сброс состояния хоста: откат DOM, снятие наблюдателя, очистка журналов.
 * Экспортируется для тестов (модульное состояние живёт между кейсами) и для teardown.
 */
export function resetDomOverrideState(): void {
  cancelScheduledReplay();
  withPausedObserver(() => {
    restoreAll();
  });
  observer?.disconnect();
  observer = null;
  desired = [];
}

/** Идемпотентность: шина не умеет разрегистрировать хендлеры — защита от повтора. */
let installed = false;

/**
 * Поднимает content-хост DOM-подмены: регистрирует `domOverride/*` в шине и вешает
 * `pagehide`-teardown (снять наблюдатель при уходе со страницы). Роутер и общий
 * teardown обеспечивает инспекционный хост, с которым модуль проводится оркестратором
 * в одном content-бандле.
 */
export function installDomOverrideContentHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('domOverride/apply', apply);
  registerHandler('domOverride/clear', clear);
  registerHandler('domOverride/list', list);
  window.addEventListener('pagehide', () => {
    resetDomOverrideState();
  });
}

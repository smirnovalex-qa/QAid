/**
 * MAIN-world кольцевой буфер значимых действий пользователя (TASK-036, TASK-013).
 *
 * Делегированные пассивные слушатели на `document`/`window` пишут последние N
 * действий (click / input / change / submit / navigation / key-жесты / resize) в
 * кольцевой буфер на `window`. Инъектируется через `executeScript({ world:'MAIN',
 * func })` — Chrome сериализует функцию как `func.toString()` БЕЗ замыкания модуля,
 * поэтому каждая функция ОБЯЗАНА быть самодостаточной: литерал ключа стора, стабильный
 * построитель селектора и все хелперы объявлены ВНУТРИ тела (ADR-0028). Любая ссылка
 * на биндинг уровня модуля стала бы свободной и упала бы ReferenceError на странице;
 * регрессию ловит `__tests__/actions-serialization.test.ts`.
 *
 * Приватность (жёстко): значения полей ввода МАСКИРУЮТСЯ (`***`/«value hidden») по
 * умолчанию; поля `type=password` не читаются НИКОГДА, ни при каких настройках. Ничего
 * не покидает страницу иначе как в снимок буфера, который забирает только наша панель
 * (`bugReport/actionsRead`). Слушатели никогда не вызывают `preventDefault` и не мешают
 * странице. Только top-документ активной вкладки (iframes честно не охватываются).
 */
import type { ActionRecord, ActionsSnapshot } from '../types';

/** Форма стора на `window` (живёт между чтениями одной сессии страницы). */
interface ActionsStore {
  installed: true;
  cap: number;
  maskValues: boolean;
  paused: boolean;
  log: ActionRecord[];
  onClick: (e: Event) => void;
  onInput: (e: Event) => void;
  onChange: (e: Event) => void;
  onSubmit: (e: Event) => void;
  onKeydown: (e: Event) => void;
  onResize: (e: Event) => void;
  onNav: () => void;
  resizeTimer: number | undefined;
  origPushState: History['pushState'];
  origReplaceState: History['replaceState'];
}

/**
 * Устанавливает (или переустанавливает) кольцевой буфер действий. Идемпотентно:
 * если стор уже стоит — обновляем только `cap`/`maskValues` (без задвоения слушателей).
 * `cap` жёстко клампится к `[1, 200]` (потолок против разрастания на долгих сессиях).
 */
export function installActionsBuffer(cap: number, maskValues: boolean): void {
  // ВАЖНО (ADR-0028): литерал ключа и все хелперы объявлены ВНУТРИ функции — тело
  // сериализуется в MAIN-world через `func.toString()` без замыкания модуля.
  const STORE_KEY = '__qatbActions__';
  const MAX = 200;
  const size = Math.min(Math.max(1, Math.floor(cap)), MAX);
  const win = window as unknown as Record<string, ActionsStore | undefined>;
  const existing = win[STORE_KEY];
  if (existing) {
    existing.cap = size;
    existing.maskValues = maskValues;
    return;
  }

  // — Инлайновый стабильный построитель селектора (самодостаточен, не бросает) —
  const stableSelector = (node: EventTarget | null): string => {
    try {
      if (!node || (node as Node).nodeType !== 1) return 'node';
      const el = node as Element;
      const attr = (name: string): string => el.getAttribute(name) ?? '';
      const testid = attr('data-testid');
      if (testid !== '') return `[data-testid=${testid}]`;
      const tag = (el.tagName !== '' ? el.tagName : 'node').toLowerCase();
      const id = attr('id');
      if (id !== '') return `${tag}#${id}`;
      const cls = Array.from(el.classList)
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join('');
      const base = tag + cls;
      const aria = attr('aria-label');
      if (aria !== '') return `${base}[aria-label=${aria.slice(0, 40)}]`;
      if (tag === 'button' || tag === 'a') {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (text !== '') return `${base} "${text}"`;
      }
      return base;
    } catch {
      return 'node';
    }
  };

  const store: ActionsStore = {
    installed: true,
    cap: size,
    maskValues,
    paused: false,
    log: [],
    onClick: () => undefined,
    onInput: () => undefined,
    onChange: () => undefined,
    onSubmit: () => undefined,
    onKeydown: () => undefined,
    onResize: () => undefined,
    onNav: () => undefined,
    resizeTimer: undefined,
    // Сырые ссылки (без bind) — teardown восстанавливает ИМЕННО их (нет накопления
    // обёрток при install→clear циклах); вызываем через `.apply(history, …)`.
    /* eslint-disable @typescript-eslint/unbound-method -- храним сырые ссылки, зовём через apply */
    origPushState: history.pushState,
    origReplaceState: history.replaceState,
    /* eslint-enable @typescript-eslint/unbound-method */
  };

  // Публикуем стор на `window` СРАЗУ — до навешивания слушателей и (рискованного)
  // патча history (best practice, как у mock-перехватчика). Инициализация ниже
  // опциональна и может частично упасть на защищённых страницах; стор ОБЯЗАН остаться
  // читаемым панелью (`readActionsBuffer` берёт `window[STORE_KEY]`), иначе слушатели
  // писали бы в осиротевший объект, а снимок буфера возвращал бы пусто. Публикация
  // последней (после патча history) была багом: страница с защищённым
  // `history.pushState` роняла install до этой строки — «no user actions captured».
  win[STORE_KEY] = store;

  const push = (rec: ActionRecord): void => {
    if (store.paused) return;
    store.log.push(rec);
    if (store.log.length > store.cap) store.log.splice(0, store.log.length - store.cap);
  };

  /** Тип поля для input/change: `type` для <input>, иначе имя тега. */
  const fieldType = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const t = (el as HTMLInputElement).type;
      return t !== '' ? t : 'text';
    }
    return tag; // textarea / select / [contenteditable] и т.п.
  };

  /** Деталь значения: пароль/маска → «value hidden»; иначе усечённое значение. */
  const valueDetail = (el: Element, type: string): string => {
    if (type === 'password') return 'value hidden'; // НИКОГДА не читаем пароль
    if (store.maskValues) return 'value hidden';
    if (type === 'checkbox' || type === 'radio') {
      return (el as HTMLInputElement).checked ? 'checked' : 'unchecked';
    }
    const raw = (el as HTMLInputElement | HTMLTextAreaElement).value;
    const v = typeof raw === 'string' ? raw : '';
    return `value: "${v.slice(0, 80)}"`;
  };

  store.onClick = (e: Event): void => {
    const t = e.target as Element | null;
    const clickable =
      t && typeof t.closest === 'function'
        ? t.closest('button, a, [role], [data-testid], input, select, textarea, label')
        : null;
    push({ kind: 'click', at: Date.now(), target: stableSelector(clickable ?? t) });
  };

  store.onInput = (e: Event): void => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const type = fieldType(el);
    push({
      kind: 'input',
      at: Date.now(),
      target: stableSelector(el),
      field: type,
      detail: valueDetail(el, type),
    });
  };

  store.onChange = (e: Event): void => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const type = fieldType(el);
    push({
      kind: 'change',
      at: Date.now(),
      target: stableSelector(el),
      field: type,
      detail: valueDetail(el, type),
    });
  };

  store.onSubmit = (e: Event): void => {
    push({ kind: 'submit', at: Date.now(), target: stableSelector(e.target) });
  };

  store.onKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent;
    const gestures = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const mods = ke.ctrlKey || ke.metaKey || ke.altKey;
    // Только жесты/шорткаты — НЕ посимвольный ввод (приватность + шум).
    if (!mods && !gestures.includes(ke.key)) return;
    const parts: string[] = [];
    if (ke.ctrlKey) parts.push('Ctrl');
    if (ke.metaKey) parts.push('Meta');
    if (ke.altKey) parts.push('Alt');
    if (ke.shiftKey) parts.push('Shift');
    parts.push(ke.key.length === 1 ? ke.key.toUpperCase() : ke.key);
    push({ kind: 'key', at: Date.now(), detail: parts.join('+') });
  };

  store.onResize = (): void => {
    if (store.resizeTimer !== undefined) window.clearTimeout(store.resizeTimer);
    store.resizeTimer = window.setTimeout(() => {
      push({
        kind: 'resize',
        at: Date.now(),
        detail: `${String(window.innerWidth)}×${String(window.innerHeight)}`,
      });
    }, 250);
  };

  store.onNav = (): void => {
    push({ kind: 'navigation', at: Date.now(), detail: location.href });
  };

  // Делегированные пассивные слушатели (capture — ловим до возможного stopPropagation).
  document.addEventListener('click', store.onClick, { capture: true, passive: true });
  document.addEventListener('input', store.onInput, { capture: true, passive: true });
  document.addEventListener('change', store.onChange, { capture: true, passive: true });
  document.addEventListener('submit', store.onSubmit, { capture: true, passive: true });
  document.addEventListener('keydown', store.onKeydown, { capture: true, passive: true });
  window.addEventListener('resize', store.onResize, { passive: true });
  window.addEventListener('hashchange', store.onNav, { passive: true });
  window.addEventListener('popstate', store.onNav, { passive: true });

  // SPA-навигация (best-effort, ИЗОЛИРОВАННО): оборачиваем history.pushState/replaceState,
  // чтобы ловить переходы без смены документа. Страница может защитить эти методы
  // (getter-only / non-writable / фреймворк-обёртка) — тогда присваивание бросает.
  // Ловим и деградируем: теряется только детект SPA-навигации, запись остальных
  // действий (click/input/submit/key/resize + hashchange/popstate) продолжает работать.
  try {
    history.pushState = function patchedPush(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      store.origPushState.apply(history, args);
      store.onNav();
    };
    history.replaceState = function patchedReplace(
      this: History,
      ...args: Parameters<History['replaceState']>
    ): void {
      store.origReplaceState.apply(history, args);
      store.onNav();
    };
  } catch {
    // history защищён страницей — SPA-навигация не отслеживается, буфер жив (стор уже
    // опубликован на window, слушатели навешаны).
  }
}

/** Возвращает снимок буфера действий + якорь клоков MAIN-world (для оси таймлайна). */
export function readActionsBuffer(): ActionsSnapshot {
  const STORE_KEY = '__qatbActions__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, ActionsStore | undefined>;
  const store = win[STORE_KEY];
  return {
    events: store ? [...store.log] : [],
    anchor: { perfNow: performance.now(), wall: Date.now() },
  };
}

/** Ставит/снимает паузу записи (no-op, если буфер не установлен). */
export function setActionsPaused(paused: boolean): void {
  const STORE_KEY = '__qatbActions__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, ActionsStore | undefined>;
  const store = win[STORE_KEY];
  if (store) store.paused = paused;
}

/**
 * Снимает все слушатели и восстанавливает history.* (отцепляет буфер от страницы).
 * No-op, если не стоял.
 *
 * `keepLog` (TASK-036) разделяет ДВА жеста поверх одного teardown'а:
 *  - `false` (полный СБРОС — Reset / новый Start): забываем буфер (`window[STORE_KEY]`
 *    обнуляется, лог выбрасывается).
 *  - `true` (СТОП с сохранением): снимаем хуки со страницы, но ОСТАВЛЯЕМ стор с логом
 *    читаемым — чтобы Capture ПОСЛЕ Stop включил записанные шаги. Замораживаем
 *    (`paused = true`) на случай гонок. Раньше Stop всегда стирал лог, и естественный
 *    сценарий «Start → воспроизвёл → Stop → Capture» терял все шаги.
 */
export function clearActionsBuffer(keepLog = false): void {
  const STORE_KEY = '__qatbActions__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, ActionsStore | undefined>;
  const store = win[STORE_KEY];
  if (!store) return;
  store.paused = true; // страховка: с этого момента ничего не пишем, даже при гонке
  document.removeEventListener('click', store.onClick, true);
  document.removeEventListener('input', store.onInput, true);
  document.removeEventListener('change', store.onChange, true);
  document.removeEventListener('submit', store.onSubmit, true);
  document.removeEventListener('keydown', store.onKeydown, true);
  window.removeEventListener('resize', store.onResize);
  window.removeEventListener('hashchange', store.onNav);
  window.removeEventListener('popstate', store.onNav);
  if (store.resizeTimer !== undefined) window.clearTimeout(store.resizeTimer);
  // Восстановление симметрично патчу: если history защищён (патч не встал), присваивание
  // бросит — гасим (наши обёртки и не стояли).
  try {
    history.pushState = store.origPushState;
    history.replaceState = store.origReplaceState;
  } catch {
    // history защищён — восстанавливать нечего.
  }
  // keepLog: стор (с логом) остаётся на window замороженным и читаемым для Capture.
  // Полный сброс — обнуляем; следующий install начнёт свежую сессию с чистым логом.
  if (!keepLog) win[STORE_KEY] = undefined;
}

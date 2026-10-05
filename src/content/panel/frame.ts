/**
 * Построение closed-Shadow-DOM обёртки плавающей панели (TASK-062, ADR-0053).
 *
 * Паттерн тот же, что у инспекционного оверлея ([content/inspection/overlay.ts]): хост в
 * `attachShadow({ mode: 'closed' })`, стили — ТОЛЬКО инлайн (CSP-safe: без внешних
 * ресурсов/`<link>`/`eval`), `all: initial` reset, data-атрибут хоста для исключения из
 * обходов DOM (инспектор/пикер игнорируют `[data-qatb-panel]`), максимальный z-index.
 * Внутри — «оконная» рамка: заголовок-ручка (drag + свернуть/закрыть) и тело с
 * cross-origin `<iframe>` на extension-страницу `src/panel/index.html#<nonce>`.
 *
 * DOM страницы НЕ мутируется: всё живёт в изолированном контейнере на `documentElement`.
 * Позиционирование — `transform: translate3d(x,y,0)` (дешевле `top/left` при драге).
 * Заголовок рисуется в обёртке (content-реалм), а НЕ в iframe — поэтому перетаскивание не
 * упирается в проблему pointer-событий над iframe.
 */

/** Data-атрибут хоста панели: по нему пикер/обходчики DOM исключают саму панель. */
export const PANEL_HOST_ATTR = 'data-qatb-panel';

/** Максимальный z-index — панель поверх любого содержимого страницы. */
const MAX_Z_INDEX = '2147483647';
/** Высота заголовка-ручки (px). Синхронизирована с clamp'ом (виден весь заголовок). */
export const PANEL_HEADER_HEIGHT = 40;

export interface PanelFrameParts {
  /** Контейнер на `documentElement` (носитель закрытого shadow root, `[data-qatb-panel]`). */
  readonly host: HTMLElement;
  /** Заголовок-ручка перетаскивания (содержит кнопки с `data-no-drag`). */
  readonly handle: HTMLElement;
  /** Тело панели (обёртка iframe; скрывается в свёрнутом состоянии). */
  readonly body: HTMLElement;
  /** iframe тела панели (extension-страница). */
  readonly iframe: HTMLIFrameElement;
  /** Кнопка свернуть/развернуть. */
  readonly collapseBtn: HTMLButtonElement;
  /** Кнопка закрыть. */
  readonly closeBtn: HTMLButtonElement;

  /** Записать позицию (`transform`). */
  setPosition(x: number, y: number): void;
  /** Показать/скрыть тело (свёрнутость). */
  setCollapsed(collapsed: boolean): void;
  /** Задать ширину тела (px). */
  setWidth(width: number): void;
  /** Задать высоту тела (px). */
  setHeight(height: number): void;
  /** Включить/выключить `pointer-events` iframe (гасится на время драга). */
  setIframeInteractive(interactive: boolean): void;
  /** Заменить тело локализованным сообщением-фолбэком (строгая CSP страницы). */
  showFallback(title: string, body: string): void;
  /** Удалить хост из документа, полный teardown. Идемпотентно. */
  destroy(): void;
}

export interface CreatePanelFrameOptions {
  /** Документ (инъекция для тестов/мульти-док). По умолчанию — глобальный `document`. */
  doc?: Document;
  /** `src` iframe: `runtime.getURL('src/panel/index.html') + '#' + nonce`. */
  iframeSrc: string;
  /** Заголовок панели (бренд). */
  title: string;
  /** Подписи кнопок (aria/title). */
  labels: { collapse: string; expand: string; close: string };
  /** Начальная ширина тела (px). */
  width: number;
  /** Начальная высота тела (px). */
  height: number;
}

const HEADER_BG = '#1f2430';
const HEADER_FG = '#e8eaed';
const BODY_BG = '#ffffff';

/** CSP-safe инлайн-стиль кнопки заголовка. */
const BTN_STYLE =
  `all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;` +
  `width: 28px; height: 28px; border-radius: 6px; cursor: pointer; color: ${HEADER_FG};` +
  `font: 600 16px/1 system-ui, sans-serif; user-select: none;`;

/**
 * Создаёт обёртку панели. Внешнее поведение (drag, postMessage, persist) навешивает
 * `host.ts`; здесь — только DOM, стили и императивные сеттеры.
 */
export function createPanelFrame(opts: CreatePanelFrameOptions): PanelFrameParts {
  const doc = opts.doc ?? document;

  const host = doc.createElement('div');
  host.setAttribute(PANEL_HOST_ATTR, '');
  // Контейнер неинтерактивен сам по себе (pointer-events: none), чтобы его «пустые» поля не
  // перехватывали клики страницы; интерактивные части (рамка) включают события обратно.
  host.style.cssText =
    `position: fixed; top: 0; left: 0; margin: 0; padding: 0; border: 0;` +
    `width: 0; height: 0; pointer-events: none; z-index: ${MAX_Z_INDEX};` +
    `transform: translate3d(0px, 0px, 0);`;

  const shadow = host.attachShadow({ mode: 'closed' });

  const reset = doc.createElement('div');
  reset.style.cssText = 'all: initial;';

  // Рамка окна (карточка): тень/радиус/бордер, собственный стек-контекст.
  const frame = doc.createElement('div');
  frame.style.cssText =
    `box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden;` +
    `width: ${String(opts.width)}px; border-radius: 10px; pointer-events: auto;` +
    `box-shadow: 0 8px 28px rgba(0,0,0,.28), 0 1px 3px rgba(0,0,0,.2); background: ${BODY_BG};` +
    `font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;`;

  // Заголовок-ручка.
  const handle = doc.createElement('div');
  handle.style.cssText =
    `box-sizing: border-box; display: flex; align-items: center; gap: 8px;` +
    `height: ${String(PANEL_HEADER_HEIGHT)}px; padding: 0 8px 0 12px; background: ${HEADER_BG};` +
    `color: ${HEADER_FG}; flex: 0 0 auto;`;

  const titleEl = doc.createElement('span');
  titleEl.textContent = opts.title;
  titleEl.style.cssText =
    `flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` +
    `font: 600 13px/1 system-ui, sans-serif; letter-spacing: .2px; user-select: none;`;

  const collapseBtn = doc.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('data-no-drag', '');
  collapseBtn.setAttribute('aria-label', opts.labels.collapse);
  collapseBtn.title = opts.labels.collapse;
  collapseBtn.textContent = '–';
  collapseBtn.style.cssText = BTN_STYLE;

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('data-no-drag', '');
  closeBtn.setAttribute('aria-label', opts.labels.close);
  closeBtn.title = opts.labels.close;
  closeBtn.textContent = '×';
  closeBtn.style.cssText = BTN_STYLE;

  handle.append(titleEl, collapseBtn, closeBtn);

  // Тело с iframe.
  const body = doc.createElement('div');
  body.style.cssText =
    `box-sizing: border-box; display: block; width: 100%; height: ${String(opts.height)}px;` +
    `background: ${BODY_BG};`;

  const iframe = doc.createElement('iframe');
  iframe.src = opts.iframeSrc;
  // `sandbox` НЕ ставим: нужны same-origin+scripts для `chrome.*`/bus (ADR-0053).
  iframe.setAttribute('title', opts.title);
  iframe.style.cssText =
    'box-sizing: border-box; display: block; width: 100%; height: 100%; border: 0; background: transparent;';
  body.appendChild(iframe);

  frame.append(handle, body);
  reset.appendChild(frame);
  shadow.appendChild(reset);
  doc.documentElement.appendChild(host);

  let collapsedState = false;

  return {
    host,
    handle,
    body,
    iframe,
    collapseBtn,
    closeBtn,
    setPosition(x, y) {
      host.style.transform = `translate3d(${String(x)}px, ${String(y)}px, 0)`;
    },
    setCollapsed(collapsed) {
      collapsedState = collapsed;
      body.style.display = collapsed ? 'none' : 'block';
      collapseBtn.textContent = collapsed ? '□' : '–';
      collapseBtn.setAttribute('aria-label', collapsed ? opts.labels.expand : opts.labels.collapse);
      collapseBtn.title = collapsed ? opts.labels.expand : opts.labels.collapse;
    },
    setWidth(width) {
      frame.style.width = `${String(width)}px`;
    },
    setHeight(height) {
      if (!collapsedState) body.style.height = `${String(height)}px`;
      else body.dataset.height = String(height);
    },
    setIframeInteractive(interactive) {
      iframe.style.pointerEvents = interactive ? 'auto' : 'none';
    },
    showFallback(title, text) {
      iframe.remove();
      const msg = doc.createElement('div');
      msg.style.cssText =
        `box-sizing: border-box; padding: 20px 18px; color: #3c4043; background: ${BODY_BG};` +
        `font: 400 13px/1.5 system-ui, sans-serif;`;
      const h = doc.createElement('div');
      h.textContent = title;
      h.style.cssText = 'font-weight: 600; margin-bottom: 6px; color: #1f2430;';
      const p = doc.createElement('div');
      p.textContent = text;
      msg.append(h, p);
      body.appendChild(msg);
    },
    destroy() {
      host.remove();
    },
  };
}

/**
 * Монтаж/жизненный цикл content-обёртки плавающей панели (TASK-062, ADR-0053).
 *
 * Собирает воедино: closed-Shadow-DOM обёртку ([frame.ts]), перетаскивание ([drag.ts] с
 * мягким clamp'ом и reclamp на `resize`), координацию с iframe тела по `postMessage` с
 * per-mount nonce ([shared/panel/protocol.ts]) и persist положения/свёрнутости/ширины
 * ([shared/panel/settings.ts] → `chrome.storage.local`).
 *
 * Обёртка НЕ держит `chrome.runtime`-роутер: тело панели (iframe — extension-контекст)
 * ходит к background тем же bus, что popup/side panel, поэтому второй роутер в isolated-world
 * (рядом с инспекционным) не нужен и не конфликтует. Идемпотентность — guard-флаг в [index.ts];
 * повторная инъекция зовёт {@link PanelHost.reopen} (развернуть + вернуть на экран), не плодя
 * второй экземпляр.
 */
import { t } from '@/i18n';
import { runtime } from '@/platform';
import { logger } from '@/shared/logger';
import {
  FromPanelSchema,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  decodePanelMessage,
  encodePanelMessage,
} from '@/shared/panel/protocol';
import { floatingPanelSettings } from '@/shared/panel/settings';
import type { FloatingPanelState } from '@/shared/panel/settings';
import type { FeatureSettings } from '@/shared/storage';
import { clampPosition, enableDrag } from './drag';
import type { DragController, Point } from './drag';
import { PANEL_HEADER_HEIGHT, createPanelFrame } from './frame';
import type { PanelFrameParts } from './frame';
import './i18n';

/** Путь extension-страницы тела панели (резолвится `runtime.getURL`; web-accessible). */
const PANEL_PAGE = 'src/panel/index.html';
/** Дедлайн ожидания `ready` от iframe: превышен → фолбэк (строгая CSP страницы). */
const READY_TIMEOUT_MS = 4000;
/** Отступ панели от кромок вьюпорта в дефолтной позиции и при вычислении высоты. */
const EDGE_MARGIN = 16;
/** Желаемая высота тела по умолчанию (клампится вьюпортом). */
const DEFAULT_BODY_HEIGHT = 560;
/** Минимальная высота тела (на очень низких вьюпортах). */
const MIN_BODY_HEIGHT = 240;

export interface PanelHost {
  /** Повторное открытие: развернуть и вернуть на экран (вызывается при ре-инъекции). */
  reopen(): void;
  /** Полный teardown: снять обёртку, слушатели, таймеры. Идемпотентно. */
  teardown(): void;
}

export interface InstallPanelHostOptions {
  /** Документ монтажа (по умолчанию глобальный `document`; инъекция для тестов). */
  doc?: Document;
  /** Окно для слушателей (по умолчанию глобальный `window`; инъекция для тестов). */
  win?: Window;
  /** Колбэк по завершению teardown (энтрипойнт сбрасывает им guard-флаг). */
  onDestroy?: () => void;
  /** Слой настроек панели (по умолчанию синглтон над `chrome.storage.local`; memory в тестах). */
  settings?: FeatureSettings<FloatingPanelState>;
  /** Резолвер URL ресурса расширения (по умолчанию `@/platform` `runtime.getURL`). */
  getURL?: (path: string) => string;
  /** Per-mount nonce (по умолчанию `crypto.randomUUID()`; детерминизм в тестах). */
  nonce?: string;
}

/**
 * Поднимает обёртку панели в документе. Все внешние зависимости инъектируемы через
 * {@link InstallPanelHostOptions} (для юнитов без Chrome). Возвращает контроллер.
 */
export function installPanelHost(options: InstallPanelHostOptions = {}): PanelHost {
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const onDestroy = options.onDestroy;
  const settings = options.settings ?? floatingPanelSettings;
  const getURL = options.getURL ?? runtime.getURL;

  const nonce = options.nonce ?? crypto.randomUUID();
  const iframeSrc = `${getURL(PANEL_PAGE)}#${nonce}`;

  const viewport = (): { width: number; height: number } => ({
    width: win.innerWidth || 1280,
    height: win.innerHeight || 800,
  });
  const bodyHeightFor = (vh: number): number =>
    Math.max(
      MIN_BODY_HEIGHT,
      Math.min(DEFAULT_BODY_HEIGHT, vh - 2 * EDGE_MARGIN - PANEL_HEADER_HEIGHT),
    );

  // Текущее состояние окна (источник истины в рантайме; синхронизируется с хранилищем).
  const vp0 = viewport();
  let width = 380;
  let height = bodyHeightFor(vp0.height);
  let collapsed = false;
  let pos: Point = { x: Math.max(EDGE_MARGIN, vp0.width - width - EDGE_MARGIN), y: EDGE_MARGIN };
  let torn = false;

  const frame: PanelFrameParts = createPanelFrame({
    doc,
    iframeSrc,
    title: t('panel.title'),
    labels: { collapse: t('panel.collapse'), expand: t('panel.expand'), close: t('panel.close') },
    width,
    height,
  });

  const clampCurrent = (x: number, y: number): Point =>
    clampPosition(x, y, { width, headerHeight: PANEL_HEADER_HEIGHT }, viewport());

  const applyPosition = (x: number, y: number): void => {
    pos = { x, y };
    frame.setPosition(x, y);
  };
  const reclamp = (): void => {
    const p = clampCurrent(pos.x, pos.y);
    applyPosition(p.x, p.y);
  };

  const persist = (patch: Partial<FloatingPanelState>): void => {
    void settings.update(patch).catch((e: unknown) => {
      logger.debug('panel: persist', e);
    });
  };

  /** Сообщить телу панели (iframe) текущее состояние окна (nonce-защищённо). */
  const postToPanel = (): void => {
    const target = frame.iframe.contentWindow;
    if (!target) return;
    target.postMessage(encodePanelMessage(nonce, { type: 'state', collapsed, width }), '*');
  };

  const setCollapsed = (next: boolean): void => {
    collapsed = next;
    frame.setCollapsed(next);
    reclamp();
    persist({ collapsed: next });
    postToPanel();
  };

  const setWidth = (next: number): void => {
    width = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, next));
    frame.setWidth(width);
    reclamp();
    persist({ width });
    postToPanel();
  };

  // ─── Перетаскивание ─────────────────────────────────────────────────────────
  const drag: DragController = enableDrag({
    handle: frame.handle,
    win,
    getPosition: () => pos,
    clamp: clampCurrent,
    onMove: (x, y) => {
      applyPosition(x, y);
    },
    onStart: () => {
      frame.setIframeInteractive(false);
    },
    onEnd: (x, y) => {
      frame.setIframeInteractive(true);
      applyPosition(x, y);
      persist({ x, y });
    },
  });

  // ─── Фолбэк при строгой CSP: iframe не прислал `ready` в дедлайн ─────────────
  let readyTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    readyTimer = null;
    logger.debug('panel: iframe ready timeout → CSP fallback');
    frame.showFallback(t('panel.csp.title'), t('panel.csp.body'));
  }, READY_TIMEOUT_MS);
  const clearReadyTimer = (): void => {
    if (readyTimer !== null) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
  };

  function teardown(): void {
    if (torn) return;
    torn = true;
    clearReadyTimer();
    win.removeEventListener('message', onMessage);
    win.removeEventListener('resize', onResize);
    win.removeEventListener('pagehide', onPageHide);
    frame.collapseBtn.removeEventListener('click', onCollapseClick);
    frame.closeBtn.removeEventListener('click', onCloseClick);
    drag.destroy();
    frame.destroy();
    onDestroy?.();
  }

  const onCollapseClick = (): void => {
    setCollapsed(!collapsed);
  };
  const onCloseClick = (): void => {
    teardown();
  };
  frame.collapseBtn.addEventListener('click', onCollapseClick);
  frame.closeBtn.addEventListener('click', onCloseClick);

  // ─── Координация с iframe по postMessage (nonce + сверка источника) ──────────
  const onMessage = (event: MessageEvent): void => {
    // Строгая защита — nonce; сверка источника вторична (гасит сообщения из других окон,
    // когда источник вообще указан): page-скрипт из своего окна отсеется, а штатные
    // сообщения тела панели пройдут.
    const src = frame.iframe.contentWindow;
    if (src && event.source && event.source !== src) return;
    const msg = decodePanelMessage(event.data, nonce, FromPanelSchema);
    if (!msg) return;
    switch (msg.type) {
      case 'ready':
        clearReadyTimer();
        postToPanel();
        break;
      case 'collapse':
        if (!collapsed) setCollapsed(true);
        break;
      case 'expand':
        if (collapsed) setCollapsed(false);
        break;
      case 'close':
        teardown();
        break;
      case 'resize':
        if (typeof msg.width === 'number') setWidth(msg.width);
        break;
    }
  };
  win.addEventListener('message', onMessage);

  // ─── Reclamp на resize вьюпорта ──────────────────────────────────────────────
  const onResize = (): void => {
    height = bodyHeightFor(viewport().height);
    frame.setHeight(height);
    reclamp();
  };
  win.addEventListener('resize', onResize);

  // ─── pagehide/SPA — корректный teardown ──────────────────────────────────────
  const onPageHide = (): void => {
    teardown();
  };
  win.addEventListener('pagehide', onPageHide);

  // Начальная геометрия.
  frame.setHeight(height);
  reclamp();

  // ─── Восстановление сохранённого состояния (async) ───────────────────────────
  void settings
    .get()
    .then((saved) => {
      if (torn) return;
      if (
        saved.width >= PANEL_MIN_WIDTH &&
        saved.width <= PANEL_MAX_WIDTH &&
        saved.width !== width
      ) {
        width = saved.width;
        frame.setWidth(width);
      }
      if (saved.collapsed) {
        collapsed = true;
        frame.setCollapsed(true);
      }
      const x = saved.x ?? pos.x;
      const y = saved.y ?? pos.y;
      const p = clampCurrent(x, y);
      applyPosition(p.x, p.y);
      postToPanel();
    })
    .catch((e: unknown) => {
      logger.debug('panel: restore', e);
    });

  return {
    reopen(): void {
      if (torn) return;
      if (collapsed) setCollapsed(false);
      reclamp();
    },
    teardown,
  };
}

/**
 * In-page («заморозка экрана», Lightshot-стиль) редактор скриншота (TASK-035) —
 * добор к TASK-027. Живёт в инспекционном content-бандле (ISOLATED world),
 * регистрирует хендлер `screenshot/editInPage` в общей шине через `registerHandler`;
 * СВОЙ роутер не поднимает — его ставит `installInspectionHost` (канон хостов
 * storage/forms/measure, TASK-013).
 *
 * Кадр вьюпорта снимает РАСШИРЕНИЕ (`captureVisibleTab` недоступен в content-скрипте)
 * и передаёт dataURL по RPC; оверлей кладёт его на `position: fixed` canvas во весь
 * вьюпорт — «замороженная» страница. Далее: drag-выделение региона с затемнением
 * вокруг, инлайн-тулбар, аннотации (рамка/стрелка/линия/текст/деструктивная замазка)
 * с undo/redo и экспорт PNG (буфер / немедленное скачивание без подтверждения) — всё локально.
 *
 * Инвариант TASK-013: DOM страницы НЕ мутируется — весь UI в собственном закрытом
 * Shadow-DOM оверлее (как `measure-tool.ts`/`overlay.ts`), стили только инлайн
 * (CSP-safe). Слушатели вешаются в фазе перехвата на `document` и полностью снимаются
 * при завершении (экспорт, `Esc`, вытеснение новым запуском, `pagehide`) — ни узлов,
 * ни слушателей после teardown не остаётся, скролл/курсор восстанавливаются.
 *
 * Реюз > переписывание: единый рендер (`composePlan`/`drawOverlay`), необратимая
 * `pixelateRegion`, история undo/redo и имя файла — из общего
 * `@/shared/inspection/screenshot/draw` (тот же источник, что и side panel). Геометрия
 * выделения/тулбара/DPR — из чистой `@/shared/inspection/screenshot/region`.
 */
import '@/shared/inspection/screenshot/messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf, ResponseOf } from '@/shared/messaging/contract';
import {
  arrowHead,
  arrowHeadSize,
  canRedo,
  canUndo,
  commit,
  composePlan,
  createHistory,
  redo,
  screenshotFileName,
  undo,
} from '@/shared/inspection/screenshot/draw';
import type {
  History,
  OverlayOp,
  Point,
  Redaction,
  RenderPlan,
} from '@/shared/inspection/screenshot/draw';
import {
  clampRectToViewport,
  handleAt,
  handlePoints,
  isSignificantRegion,
  moveRect,
  normalizeRect,
  rectFromPoints,
  regionToDeviceCrop,
  resizeRect,
  toolbarPosition,
} from '@/shared/inspection/screenshot/region';
import type { Handle, Rect, Size } from '@/shared/inspection/screenshot/region';

/** Максимальный z-index — оверлей поверх любого содержимого страницы. */
const MAX_Z_INDEX = '2147483647';
/** Радиус хит-теста ручек ресайза (CSS px). */
const HANDLE_HIT = 16;
/** Визуальный размер квадратика ручки (CSS px). */
const HANDLE_DRAW = 8;
/** Отступ инлайн-тулбара от выделения (CSS px). */
const TOOLBAR_MARGIN = 8;
/** Затемнение области вокруг выделения. */
const DIMMER = 'rgba(0, 0, 0, 0.45)';
/** Акцентный цвет рамки выделения/ручек. */
const ACCENT = '#2f81f7';

/**
 * Полный набор пользовательских событий, которые оверлей ОБЯЗАН удерживать в себе.
 * Интерактивные части оверлея (кнопки тулбара, инлайн-поле подписи) живут в закрытом
 * Shadow-DOM и должны получать нативные жесты — поэтому capture-барьер на `document`
 * их не гасит. Но composed-события (мышь/указатель/тач/клавиатура/буфер/drag) всё равно
 * всплывают из shadow к делегированным `document`/`window`-слушателям «замороженной»
 * страницы: роутеры SPA, горячие клавиши, «клик мимо», аналитика. Ловим их в фазе
 * всплытия на host — уже ПОСЛЕ обработки целевым элементом оверлея, но ДО выхода в
 * документ страницы, — и обрываем распространение. Только всплывающие типы (например,
 * `pointerenter`/`mouseleave` не всплывают и к документу не доходят — их не включаем).
 */
const SHIELDED_EVENTS: readonly string[] = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerover',
  'pointerout',
  'pointercancel',
  'gotpointercapture',
  'lostpointercapture',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'keydown',
  'keypress',
  'keyup',
  'input',
  'beforeinput',
  'focusin',
  'focusout',
  'copy',
  'cut',
  'paste',
  'dragstart',
  'drag',
  'dragend',
];

/** Инструменты аннотаций (порядок = порядок кнопок тулбара). */
type Tool = 'rectangle' | 'arrow' | 'freehand' | 'text' | 'blur';
const TOOLS: readonly Tool[] = ['rectangle', 'arrow', 'freehand', 'text', 'blur'];
/** Палитра быстрого выбора (подмножество палитры фичи). */
const PALETTE: readonly string[] = [
  '#e5484d',
  '#f76808',
  '#ffb224',
  '#30a46c',
  '#0091ff',
  '#111111',
  '#ffffff',
];

/** Ключи локализуемых подписей тулбара/подсказок. */
type LabelKey =
  | 'tool.rectangle'
  | 'tool.arrow'
  | 'tool.freehand'
  | 'tool.text'
  | 'tool.blur'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'download'
  | 'cancel'
  | 'color'
  | 'thickness'
  | 'thicker'
  | 'thinner'
  | 'textPlaceholder'
  | 'hintSelect'
  | 'toolbar';

/** Встроенные английские дефолты (graceful degradation при отсутствии локали). */
const DEFAULT_LABELS: Record<LabelKey, string> = {
  'tool.rectangle': 'Box',
  'tool.arrow': 'Arrow',
  'tool.freehand': 'Line',
  'tool.text': 'Text',
  'tool.blur': 'Redact',
  undo: 'Undo',
  redo: 'Redo',
  copy: 'Copy',
  download: 'Download',
  cancel: 'Cancel',
  color: 'Colour',
  thickness: 'Thickness',
  thicker: 'Thicker',
  thinner: 'Thinner',
  textPlaceholder: 'Caption…',
  hintSelect: 'Drag to select an area · Esc to cancel',
  toolbar: 'Screenshot tools',
};

type Status = ResponseOf<'screenshot/editInPage'>['status'];

/** Черновик рисуемой аннотации (device px). */
type Draft =
  | { readonly type: 'overlay'; readonly op: OverlayOp }
  | { readonly type: 'redaction'; readonly op: Redaction };

/** Активная сессия редактора (single-flight): позволяет вытеснить её извне. */
let activeSession: { cancel: () => void } | null = null;

function cancelActive(): void {
  const session = activeSession;
  if (session) {
    activeSession = null;
    session.cancel();
  }
}

/** Значим ли черновик для фиксации (не вырожденный клик). */
function isSignificantDraft(draft: Draft): boolean {
  if (draft.type === 'redaction') return draft.op.width >= 4 && draft.op.height >= 4;
  const op = draft.op;
  switch (op.kind) {
    case 'rectangle':
      return op.rect.width >= 4 && op.rect.height >= 4;
    case 'arrow':
      return Math.hypot(op.x2 - op.x1, op.y2 - op.y1) >= 6;
    case 'freehand':
      return op.points.length >= 2;
    case 'text':
      return op.text.trim() !== '';
  }
}

/** Сливает черновик в план для живого превью. */
function planWithDraft(base: RenderPlan, draft: Draft | null): RenderPlan {
  if (draft === null) return base;
  if (draft.type === 'redaction') {
    return { redactions: [...base.redactions, draft.op], overlays: base.overlays };
  }
  return { redactions: base.redactions, overlays: [...base.overlays, draft.op] };
}

/**
 * Запускает in-page редактор для переданного кадра. Резолвится терминальным статусом
 * (`copied`/`downloaded`/`cancelled`/`unavailable`) при закрытии оверлея.
 */
function editInPage(req: RequestOf<'screenshot/editInPage'>): Promise<{ status: Status }> {
  // Single-flight: вытесняем прежнюю сессию, чтобы не копить оверлеи/слушатели.
  cancelActive();

  const label = (key: LabelKey): string => req.labels?.[key] ?? DEFAULT_LABELS[key];

  return new Promise<{ status: Status }>((resolve) => {
    const doc = document;
    const win = doc.defaultView ?? window;
    const dpr = win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    const frame: Size = { width: req.width, height: req.height };

    let settled = false;
    const img = new Image();

    // ── состояние редактора ──
    let phase: 'selecting' | 'editing' = 'selecting';
    let region: Rect | null = null;
    let tool: Tool = 'rectangle';
    let color = PALETTE[0] ?? '#e5484d';
    let thicknessCss = 4;
    let history: History<RenderPlan> = createHistory<RenderPlan>({ redactions: [], overlays: [] });
    let draft: Draft | null = null;
    let textPoint: Point | null = null;

    // ── drag-состояние ──
    type DragKind = 'select' | 'draw' | 'resize' | 'move';
    let drag: DragKind | null = null;
    let dragStart: Point = { x: 0, y: 0 };
    let regionAtStart: Rect | null = null;
    let activeHandle: Handle | null = null;

    const viewport = (): Size => ({ width: win.innerWidth, height: win.innerHeight });
    const toDevice = (p: Point): Point => ({ x: p.x * dpr, y: p.y * dpr });
    const deviceThickness = (): number => Math.max(1, Math.round(thicknessCss * dpr));

    // ── DOM: закрытый Shadow-DOM оверлей ──
    const host = doc.createElement('div');
    host.setAttribute('data-qatb-overlay', '');
    host.style.cssText = `position: fixed; inset: 0; margin: 0; padding: 0; border: 0; pointer-events: none; z-index: ${MAX_Z_INDEX};`;
    const shadow = host.attachShadow({ mode: 'closed' });
    const wrapper = doc.createElement('div');
    wrapper.style.cssText = 'all: initial;';

    const frameCanvas = doc.createElement('canvas');
    frameCanvas.width = frame.width;
    frameCanvas.height = frame.height;
    frameCanvas.style.cssText =
      'position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none;';
    const chromeCanvas = doc.createElement('canvas');
    chromeCanvas.width = frame.width;
    chromeCanvas.height = frame.height;
    chromeCanvas.style.cssText =
      'position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: auto;';

    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    const chromeCtx = chromeCanvas.getContext('2d');

    // ── тулбар (реальные кнопки, pointer-events: auto) ──
    const toolbar = doc.createElement('div');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', label('toolbar'));
    toolbar.style.cssText =
      'position: fixed; left: 0; top: 0; display: none; gap: 4px; align-items: center; ' +
      'padding: 6px; background: #1b1b1f; border: 1px solid #333; border-radius: 8px; ' +
      'box-shadow: 0 6px 24px rgba(0,0,0,0.4); pointer-events: auto; ' +
      'font: 12px/1.2 system-ui, sans-serif; color: #eee; flex-wrap: nowrap; user-select: none;';

    const mkBtn = (labelText: string, text: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.setAttribute('aria-label', labelText);
      b.title = labelText;
      b.style.cssText =
        'all: unset; box-sizing: border-box; cursor: pointer; min-width: 26px; height: 26px; ' +
        'padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; ' +
        'border-radius: 5px; background: #2a2a30; color: #eee;';
      return b;
    };
    const setPressed = (b: HTMLButtonElement, on: boolean): void => {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.background = on ? ACCENT : '#2a2a30';
    };

    const toolBtns = new Map<Tool, HTMLButtonElement>();
    const glyphs: Record<Tool, string> = {
      rectangle: '▭',
      arrow: '↗',
      freehand: '〜',
      text: 'T',
      blur: '▨',
    };
    for (const tl of TOOLS) {
      const b = mkBtn(label(`tool.${tl}` as LabelKey), glyphs[tl]);
      b.addEventListener('click', () => {
        tool = tl;
        textPoint = null;
        hideTextInput();
        syncToolbar();
      });
      toolBtns.set(tl, b);
      toolbar.appendChild(b);
    }

    // палитра
    const paletteWrap = doc.createElement('div');
    paletteWrap.setAttribute('role', 'group');
    paletteWrap.setAttribute('aria-label', label('color'));
    paletteWrap.style.cssText = 'display: inline-flex; gap: 3px; margin: 0 4px;';
    const swatches = new Map<string, HTMLButtonElement>();
    for (const hex of PALETTE) {
      const s = doc.createElement('button');
      s.type = 'button';
      s.setAttribute('aria-label', hex);
      s.style.cssText = `all: unset; cursor: pointer; width: 16px; height: 16px; border-radius: 50%; background: ${hex}; box-shadow: 0 0 0 1px rgba(255,255,255,0.25);`;
      s.addEventListener('click', () => {
        color = hex;
        syncToolbar();
      });
      swatches.set(hex, s);
      paletteWrap.appendChild(s);
    }
    toolbar.appendChild(paletteWrap);

    // толщина
    const thinner = mkBtn(label('thinner'), '−');
    const thicker = mkBtn(label('thicker'), '+');
    thinner.addEventListener('click', () => {
      thicknessCss = Math.max(1, thicknessCss - 1);
    });
    thicker.addEventListener('click', () => {
      thicknessCss = Math.min(32, thicknessCss + 1);
    });
    toolbar.appendChild(thinner);
    toolbar.appendChild(thicker);

    // Инлайн-ввод подписи (Paint/Lightshot): плавающий `position: fixed` инпут,
    // появляется прямо в точке клика по выделению; печать на месте, фиксация по
    // Enter/blur, отмена по Esc. Живёт вне тулбара, поверх кадра (pointer-events: auto).
    const textInput = doc.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = label('textPlaceholder');
    textInput.setAttribute('aria-label', label('tool.text'));
    textInput.style.cssText =
      `position: fixed; left: 0; top: 0; display: none; box-sizing: border-box; min-width: 120px; ` +
      `padding: 2px 6px; background: rgba(255,255,255,0.96); color: #111; ` +
      `border: 1px dashed ${ACCENT}; border-radius: 4px; outline: none; pointer-events: auto; ` +
      `font: 16px/1.2 system-ui, sans-serif; z-index: ${MAX_Z_INDEX}; transform: translateY(-50%);`;
    textInput.addEventListener('blur', () => {
      placeText();
    });

    // undo/redo
    const undoBtn = mkBtn(label('undo'), '⤺');
    const redoBtn = mkBtn(label('redo'), '⤻');
    undoBtn.addEventListener('click', () => {
      history = undo(history);
      render();
      syncToolbar();
    });
    redoBtn.addEventListener('click', () => {
      history = redo(history);
      render();
      syncToolbar();
    });
    toolbar.appendChild(undoBtn);
    toolbar.appendChild(redoBtn);

    // экспорт
    const copyBtn = mkBtn(label('copy'), '⧉');
    copyBtn.addEventListener('click', () => {
      void doCopy();
    });
    const downloadBtn = mkBtn(label('download'), '⭳');
    downloadBtn.addEventListener('click', () => {
      void doDownload();
    });
    const cancelBtn = mkBtn(label('cancel'), '✕');
    cancelBtn.addEventListener('click', () => {
      finish('cancelled');
    });
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(downloadBtn);
    toolbar.appendChild(cancelBtn);

    // подсказка выделения (фаза selecting)
    const hint = doc.createElement('div');
    hint.textContent = label('hintSelect');
    hint.style.cssText =
      'position: fixed; left: 50%; top: 16px; transform: translateX(-50%); pointer-events: none; ' +
      'padding: 6px 12px; background: rgba(27,27,31,0.9); color: #eee; border-radius: 6px; ' +
      'font: 12px/1.2 system-ui, sans-serif;';

    wrapper.appendChild(frameCanvas);
    wrapper.appendChild(chromeCanvas);
    wrapper.appendChild(hint);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(textInput);
    shadow.appendChild(wrapper);
    doc.documentElement.appendChild(host);

    const prevCursor = doc.documentElement.style.cursor;
    doc.documentElement.style.cursor = 'crosshair';

    // ── рендер ──
    function deviceRect(r: Rect): { x: number; y: number; w: number; h: number } {
      const n = normalizeRect(r);
      return { x: n.x * dpr, y: n.y * dpr, w: n.width * dpr, h: n.height * dpr };
    }

    function render(): void {
      if (frameCtx === null || chromeCtx === null) return;
      composePlan(frameCtx, img, planWithDraft(history.present, draft));

      chromeCtx.clearRect(0, 0, frame.width, frame.height);
      chromeCtx.fillStyle = DIMMER;
      chromeCtx.fillRect(0, 0, frame.width, frame.height);
      if (region !== null) {
        const r = deviceRect(region);
        // Прорезаем «окно» — снизу проступает яркий кадр с аннотациями.
        chromeCtx.clearRect(r.x, r.y, r.w, r.h);
        chromeCtx.save();
        chromeCtx.strokeStyle = ACCENT;
        chromeCtx.lineWidth = Math.max(1, dpr);
        chromeCtx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        // размеры
        chromeCtx.fillStyle = ACCENT;
        chromeCtx.font = `${String(Math.round(12 * dpr))}px system-ui, sans-serif`;
        chromeCtx.textBaseline = 'bottom';
        const n = normalizeRect(region);
        const sizeText = `${String(Math.round(n.width))} × ${String(Math.round(n.height))}`;
        const labelY = r.y > 20 * dpr ? r.y - 4 * dpr : r.y + 16 * dpr;
        chromeCtx.fillText(sizeText, r.x, labelY);
        // ручки (только в фазе редактирования)
        if (phase === 'editing') {
          const pts = handlePoints(region);
          const hs = HANDLE_DRAW * dpr;
          chromeCtx.fillStyle = '#fff';
          chromeCtx.strokeStyle = ACCENT;
          chromeCtx.lineWidth = Math.max(1, dpr);
          for (const key of Object.keys(pts) as (keyof typeof pts)[]) {
            const c = pts[key];
            chromeCtx.fillRect(c.x * dpr - hs / 2, c.y * dpr - hs / 2, hs, hs);
            chromeCtx.strokeRect(c.x * dpr - hs / 2, c.y * dpr - hs / 2, hs, hs);
          }
        }
        chromeCtx.restore();
      }
    }

    function positionToolbar(): void {
      if (region === null) return;
      const tb: Size = {
        width: toolbar.offsetWidth || 320,
        height: toolbar.offsetHeight || 40,
      };
      const pos = toolbarPosition(region, tb, viewport(), TOOLBAR_MARGIN);
      toolbar.style.left = `${String(Math.round(pos.x))}px`;
      toolbar.style.top = `${String(Math.round(pos.y))}px`;
    }

    function syncToolbar(): void {
      for (const [tl, b] of toolBtns) setPressed(b, tl === tool);
      for (const [hex, s] of swatches) {
        s.style.boxShadow =
          hex === color ? `0 0 0 2px ${ACCENT}` : '0 0 0 1px rgba(255,255,255,0.25)';
      }
      undoBtn.style.opacity = canUndo(history) ? '1' : '0.4';
      redoBtn.style.opacity = canRedo(history) ? '1' : '0.4';
    }

    /** Показывает инлайн-инпут подписи в CSS-точке клика и фокусирует его. */
    function showTextInput(p: Point): void {
      textInput.value = '';
      textInput.style.left = `${String(Math.round(p.x))}px`;
      textInput.style.top = `${String(Math.round(p.y))}px`;
      textInput.style.color = color;
      textInput.style.fontSize = `${String(Math.max(12, thicknessCss * 6))}px`;
      textInput.style.display = 'inline-block';
      textInput.focus();
    }

    function hideTextInput(): void {
      textInput.style.display = 'none';
      textInput.value = '';
    }

    function enterEditing(): void {
      phase = 'editing';
      hint.style.display = 'none';
      toolbar.style.display = 'inline-flex';
      doc.documentElement.style.cursor = prevCursor;
      syncToolbar();
      positionToolbar();
      render();
    }

    // ── ввод (device-агностичный слой над region.ts) ──
    function cssPoint(e: MouseEvent): Point {
      return { x: e.clientX, y: e.clientY };
    }

    function isInToolbar(p: Point): boolean {
      if (toolbar.style.display === 'none') return false;
      const r = toolbar.getBoundingClientRect();
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    }

    function isInTextInput(p: Point): boolean {
      if (textInput.style.display === 'none') return false;
      const r = textInput.getBoundingClientRect();
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    }

    function startDraft(p: Point): void {
      const dp = toDevice(p);
      const thickness = deviceThickness();
      if (tool === 'rectangle') {
        draft = {
          type: 'overlay',
          op: {
            kind: 'rectangle',
            rect: { x: dp.x, y: dp.y, width: 0, height: 0 },
            color,
            thickness,
          },
        };
      } else if (tool === 'blur') {
        draft = { type: 'redaction', op: { x: dp.x, y: dp.y, width: 0, height: 0 } };
      } else if (tool === 'arrow') {
        draft = {
          type: 'overlay',
          op: {
            kind: 'arrow',
            x1: dp.x,
            y1: dp.y,
            x2: dp.x,
            y2: dp.y,
            head: arrowHead(dp.x, dp.y, dp.x, dp.y, arrowHeadSize(thickness)),
            color,
            thickness,
          },
        };
      } else {
        draft = { type: 'overlay', op: { kind: 'freehand', points: [dp], color, thickness } };
      }
    }

    function updateDraft(p: Point): void {
      if (draft === null) return;
      const dp = toDevice(p);
      if (draft.type === 'redaction') {
        const s = toDevice(dragStart);
        draft = { type: 'redaction', op: normRedaction(s, dp) };
        return;
      }
      const op = draft.op;
      if (op.kind === 'rectangle') {
        const s = toDevice(dragStart);
        const n = normRedaction(s, dp);
        draft = { type: 'overlay', op: { ...op, rect: n } };
      } else if (op.kind === 'arrow') {
        draft = {
          type: 'overlay',
          op: {
            ...op,
            x2: dp.x,
            y2: dp.y,
            head: arrowHead(op.x1, op.y1, dp.x, dp.y, arrowHeadSize(op.thickness)),
          },
        };
      } else if (op.kind === 'freehand') {
        draft = { type: 'overlay', op: { ...op, points: [...op.points, dp] } };
      }
    }

    function normRedaction(a: Point, b: Point): Redaction {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
    }

    function commitDraft(): void {
      if (draft !== null && isSignificantDraft(draft)) {
        history = commit(history, planWithDraft(history.present, draft));
      }
      draft = null;
    }

    function placeText(): void {
      if (settled) return; // blur во время teardown — не фиксируем осиротевшую подпись
      const value = textInput.value.trim();
      if (textPoint === null || value === '') {
        hideTextInput();
        textPoint = null;
        return;
      }
      const fontSize = Math.max(12, thicknessCss * 6) * dpr;
      const op: OverlayOp = {
        kind: 'text',
        x: textPoint.x,
        y: textPoint.y,
        text: value,
        color,
        fontSize,
      };
      history = commit(history, {
        redactions: history.present.redactions,
        overlays: [...history.present.overlays, op],
      });
      hideTextInput();
      textPoint = null;
      render();
      syncToolbar();
    }

    // ── обработчики document (capture-phase; блокируют замороженную страницу) ──
    function onMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      const p = cssPoint(e);
      // Тулбар и активный инлайн-инпут подписи — нативные жесты, не перехватываем.
      if (isInToolbar(p) || isInTextInput(p)) return;
      e.preventDefault();
      e.stopPropagation();

      if (phase === 'selecting') {
        drag = 'select';
        dragStart = p;
        region = { x: p.x, y: p.y, width: 0, height: 0 };
        render();
        return;
      }

      if (region === null) return;
      // Текст: клик внутри выделения открывает инлайн-инпут прямо в точке (как Paint).
      // Прежнюю недопечатанную подпись фиксируем, чтобы не потерять.
      if (tool === 'text') {
        if (pointInRegion(p)) {
          placeText();
          textPoint = toDevice(p);
          showTextInput(p);
        }
        return;
      }

      const handle = handleAt(region, p, HANDLE_HIT);
      if (handle !== null && handle !== 'move') {
        drag = 'resize';
        activeHandle = handle;
        dragStart = p;
        regionAtStart = region;
        return;
      }
      if (handle === 'move') {
        // Внутри у кромки — двигаем выделение; в глубине — рисуем текущим инструментом.
        if (inInnerZone(p)) {
          drag = 'draw';
          dragStart = p;
          startDraft(p);
          render();
        } else {
          drag = 'move';
          dragStart = p;
          regionAtStart = region;
        }
      }
      // Клик вне выделения — игнорируем (регион уже зафиксирован).
    }

    function onMouseMove(e: MouseEvent): void {
      if (drag === null) return;
      e.preventDefault();
      const p = cssPoint(e);
      if (drag === 'select') {
        region = clampRectToViewport(rectFromPoints(dragStart, p), viewport());
      } else if (drag === 'resize' && regionAtStart !== null && activeHandle !== null) {
        region = clampRectToViewport(
          resizeRect(regionAtStart, activeHandle, p.x - dragStart.x, p.y - dragStart.y),
          viewport(),
        );
        positionToolbar();
      } else if (drag === 'move' && regionAtStart !== null) {
        region = moveRect(regionAtStart, p.x - dragStart.x, p.y - dragStart.y, viewport());
        positionToolbar();
      } else if (drag === 'draw') {
        updateDraft(p);
      }
      render();
    }

    function onMouseUp(e: MouseEvent): void {
      if (drag === null) return;
      e.preventDefault();
      const finishedDrag = drag;
      drag = null;
      activeHandle = null;
      regionAtStart = null;

      if (finishedDrag === 'select') {
        if (region !== null && isSignificantRegion(region)) {
          region = clampRectToViewport(region, viewport());
          enterEditing();
        } else {
          region = null;
          render();
        }
        return;
      }
      if (finishedDrag === 'draw') {
        commitDraft();
        syncToolbar();
      }
      render();
    }

    /**
     * Модальный барьер: гасит производные от указателя события (`click`/`dblclick`/
     * `auxclick`/`contextmenu`) над оверлеем, чтобы они не доходили до замороженной
     * страницы (навигация/меню). Над тулбаром не трогаем — там нативные жесты
     * (правый клик/вставка в поле подписи).
     */
    function onPointerBarrier(e: MouseEvent): void {
      const p = cssPoint(e);
      if (isInToolbar(p) || isInTextInput(p)) return;
      e.preventDefault();
      e.stopPropagation();
    }

    function onKeyDown(e: KeyboardEvent): void {
      // Ввод текста: Enter фиксирует подпись, Esc отменяет — не закрывая редактор.
      if (shadow.activeElement === textInput) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          placeText();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          textPoint = null;
          hideTextInput();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish('cancelled');
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        e.stopPropagation();
        history = e.shiftKey ? redo(history) : undo(history);
        render();
        syncToolbar();
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        e.stopPropagation();
        history = redo(history);
        render();
        syncToolbar();
      }
    }

    function onPageHide(): void {
      finish('cancelled');
    }

    /**
     * Экран страницы: обрывает всплытие любого пользовательского события оверлея на host,
     * чтобы нативные жесты по кнопкам/полю подписи/холсту не достигали делегированных
     * `document`/`window`-слушателей «замороженной» страницы. Гасит только распространение
     * (`stopPropagation`), не `preventDefault` — поэтому фокус, каретка, ввод и paste в
     * поле подписи работают штатно, а страница под оверлеем ничего не получает.
     */
    function shieldFromPage(e: Event): void {
      e.stopPropagation();
    }

    function pointInRegion(p: Point): boolean {
      if (region === null) return false;
      const n = normalizeRect(region);
      return p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height;
    }

    /** Точка «в глубине» выделения (дальше HANDLE_HIT от кромки) — зона рисования. */
    function inInnerZone(p: Point): boolean {
      if (region === null) return false;
      const n = normalizeRect(region);
      const m = HANDLE_HIT;
      return (
        p.x >= n.x + m && p.x <= n.x + n.width - m && p.y >= n.y + m && p.y <= n.y + n.height - m
      );
    }

    // ── экспорт ──
    /** Компонует финальную сцену и вырезает выделенный регион в PNG-blob. */
    async function exportBlob(): Promise<Blob | null> {
      if (region === null) return null;
      const crop = regionToDeviceCrop(region, dpr, frame);
      if (crop.sw <= 0 || crop.sh <= 0) return null;
      const full = doc.createElement('canvas');
      full.width = frame.width;
      full.height = frame.height;
      const fctx = full.getContext('2d', { willReadFrequently: true });
      if (fctx === null) return null;
      composePlan(fctx, img, history.present); // деструктивная замазка → пиксели вырезки
      const out = doc.createElement('canvas');
      out.width = crop.sw;
      out.height = crop.sh;
      const octx = out.getContext('2d');
      if (octx === null) return null;
      octx.drawImage(full, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
      return await new Promise<Blob | null>((res) => {
        out.toBlob((b) => {
          res(b);
        }, 'image/png');
      });
    }

    async function doCopy(): Promise<void> {
      try {
        const blob = await exportBlob();
        if (blob === null) return;
        const Ctor = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
        if (Ctor === undefined) throw new Error('ClipboardItem unavailable');
        await navigator.clipboard.write([new Ctor({ 'image/png': blob })]);
        finish('copied');
      } catch {
        // Буфер недоступен (нет фокуса/права) — оставляем оверлей открытым, не падаем.
      }
    }

    async function doDownload(): Promise<void> {
      try {
        const blob = await exportBlob();
        if (blob === null) return;
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = screenshotFileName('inpage', new Date());
        doc.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        finish('downloaded');
      } catch {
        // Скачивание не удалось — оставляем оверлей открытым, не падаем.
      }
    }

    // ── жизненный цикл ──
    function finish(status: Status): void {
      if (settled) return;
      settled = true;
      doc.removeEventListener('mousedown', onMouseDown, true);
      doc.removeEventListener('mousemove', onMouseMove, true);
      doc.removeEventListener('mouseup', onMouseUp, true);
      doc.removeEventListener('click', onPointerBarrier, true);
      doc.removeEventListener('dblclick', onPointerBarrier, true);
      doc.removeEventListener('auxclick', onPointerBarrier, true);
      doc.removeEventListener('contextmenu', onPointerBarrier, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      win.removeEventListener('pagehide', onPageHide);
      for (const type of SHIELDED_EVENTS) host.removeEventListener(type, shieldFromPage);
      doc.documentElement.style.cursor = prevCursor;
      host.remove();
      if (activeSession === session) activeSession = null;
      resolve({ status });
    }

    const session = {
      cancel: (): void => {
        finish('cancelled');
      },
    };
    activeSession = session;

    img.onload = (): void => {
      if (settled) return;
      render();
    };
    img.onerror = (): void => {
      finish('unavailable');
    };
    img.src = req.image;

    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('mouseup', onMouseUp, true);
    doc.addEventListener('click', onPointerBarrier, true);
    doc.addEventListener('dblclick', onPointerBarrier, true);
    doc.addEventListener('auxclick', onPointerBarrier, true);
    doc.addEventListener('contextmenu', onPointerBarrier, true);
    doc.addEventListener('keydown', onKeyDown, true);
    win.addEventListener('pagehide', onPageHide);
    // Экран страницы: перехват всплытия событий оверлея на границе host (см. SHIELDED_EVENTS).
    for (const type of SHIELDED_EVENTS) host.addEventListener(type, shieldFromPage);
  });
}

/** Хендлер in-page редактора — экспортируется для прямого юнит-тестирования. */
export const screenshotEditorHandlers = { editInPage };

/** Установлен ли хост (шина не умеет разрегистрировать — защита от повтора). */
let installed = false;

/**
 * Регистрирует хендлер `screenshot/editInPage` в шине content-реалма. Роутер НЕ
 * поднимает — его ставит `installInspectionHost()`. Вызывается оркестратором в
 * content-бандле (`content/inspection/index.ts`).
 */
export function installScreenshotEditorHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('screenshot/editInPage', editInPage);
}

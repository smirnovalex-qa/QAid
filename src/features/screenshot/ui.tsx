/**
 * UI фичи «Скриншот с аннотациями» (TASK-027), поверхность side panel.
 *
 * Захват в трёх режимах (видимая область / выбранный элемент через пикер TASK-013 /
 * полная страница склейкой) → редактор аннотаций на `<canvas>` (рамка, стрелка,
 * свободная линия, текст, деструктивная замазка) с undo/redo, выбором цвета/толщины
 * → экспорт PNG (копирование через `ClipboardItem` / скачивание файла).
 *
 * Приватность: замазка применяется к пикселям экспортируемого изображения
 * (`pixelateRegion` в чистой `logic.ts`), а не рисуется снимаемым оверлеем — то, что
 * видно на холсте, то и в файле (WYSIWYG). Никакой внешней сети: всё локально.
 *
 * Вся геометрия/модель — в чистой `logic.ts`; здесь только растр (drawImage/
 * getImageData/putImageData) и связывание с DOM/настройками. Устойчивость к ошибкам,
 * `busy` со сбросом в `finally`, токен сессии против устаревших ответов — по образцу
 * инспекторов (storage-editor/inspector-ruler).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, FeaturePanel, useToast } from '@/ui';
import { cn } from '@/ui/cn';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import type { PickedElement } from '@/shared/inspection/types';
import '@/shared/inspection/screenshot/messages';
import { isInjectablePageUrl } from '@/shared/inspection/screenshot/region';
import {
  buildRenderPlan,
  clampThickness,
  composePlan,
  createHistory,
  commit as commitHistory,
  canRedo,
  canUndo,
  makeAnnotationId,
  redo as redoHistory,
  screenshotFileName,
  undo as undoHistory,
} from './logic';
import type { History } from './logic';
import { captureElement, captureFullPage, captureVisible } from './capture';
import { screenshotBinding } from './settings';
import type { Annotation, AnnotationTool, CaptureMode, CaptureResult, Point } from './types';
import styles from './screenshot.module.css';

// Host-токен захвата — именно `<all_urls>`, а НЕ узкий `*://*/*`: Chrome-гейт
// `chrome.tabs.captureVisibleTab` (`CanCaptureVisiblePage`) принимает только
// литеральный `<all_urls>` либо `activeTab`; узкий паттерн он отвергает («Either the
// '<all_urls>' or 'activeTab' permission is required»), даже будучи выданным.
// `<all_urls>` — надвкладочный (переживает переключение вкладок в side panel, в
// отличие от `activeTab`, ADR-0022) и покрывает host-доступ инъекции пикера/склейки.
// Запрашивается брокером под жестом (opt-in, ADR-0013).
/** Права для захвата элемента/полной страницы: инъекция + host-доступ захвата. */
const INJECT_PERMS: PermissionRequest = { optional: ['scripting'], host: ['<all_urls>'] };
/** Право для захвата видимой области: host-доступ, принимаемый `captureVisibleTab`. */
const CAPTURE_PERMS: PermissionRequest = { host: ['<all_urls>'] };

let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Инструменты редактора (порядок = порядок кнопок). */
const TOOLS: readonly AnnotationTool[] = ['rectangle', 'arrow', 'freehand', 'text', 'blur'];

/** Короткие глифы панели инструментов (v3 Capture). */
const TOOL_GLYPHS: Record<AnnotationTool, string> = {
  rectangle: '▢',
  arrow: '↗',
  freehand: '✎',
  text: 'T',
  blur: '▦',
};

/**
 * Фиксированные образцы цвета (v3 Capture, бренд QAid Grid): красный (Alarm UI
 * #D61F45) · amber (#FFB020) · cobalt (#2F5BEA) · ink (#141A2E).
 */
const SWATCHES: readonly { hex: string; key: string }[] = [
  { hex: '#d61f45', key: 'red' },
  { hex: '#ffb020', key: 'yellow' },
  { hex: '#2f5bea', key: 'blue' },
  { hex: '#141a2e', key: 'black' },
];

/** Три толщины обводки (v3 Capture): тонкая / средняя / толстая. */
const WIDTHS: readonly { value: number; key: string }[] = [
  { value: 2, key: 'thin' },
  { value: 4, key: 'medium' },
  { value: 7, key: 'thick' },
];

/**
 * Локализованные подписи для in-page оверлея (TASK-035): панель владеет i18n (`t`),
 * а content-редактор локале-агностичен и получает готовые строки по RPC. Ключи
 * совпадают с `LabelKey` в `content/inspection/screenshot-editor.ts`.
 */
function inPageLabels(): Record<string, string> {
  return {
    'tool.rectangle': t('screenshot.tool.rectangle'),
    'tool.arrow': t('screenshot.tool.arrow'),
    'tool.freehand': t('screenshot.tool.freehand'),
    'tool.text': t('screenshot.tool.text'),
    'tool.blur': t('screenshot.tool.blur'),
    undo: t('screenshot.undo'),
    redo: t('screenshot.redo'),
    copy: t('screenshot.copy'),
    download: t('screenshot.download'),
    cancel: t('screenshot.inPage.close'),
    color: t('screenshot.color'),
    thickness: t('screenshot.thickness'),
    thicker: t('screenshot.inPage.thicker'),
    thinner: t('screenshot.inPage.thinner'),
    textPlaceholder: t('screenshot.textPlaceholder'),
    hintSelect: t('screenshot.inPage.hintSelect'),
    toolbar: t('screenshot.inPage.toolbar'),
  };
}

/** Мягко валидирует снимок выбранного элемента (пересёк границу сред как `unknown`). */
function asPicked(value: unknown): PickedElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<PickedElement>;
  const rect: unknown = v.rect;
  if (typeof v.selector !== 'string' || typeof rect !== 'object' || rect === null) return null;
  return v as PickedElement;
}

/** Экранные координаты события → пиксели изображения (с учётом CSS-масштаба холста). */
function eventToImagePoint(canvas: HTMLCanvasElement, e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width > 0 ? rect.width : canvas.width);
  const scaleY = canvas.height / (rect.height > 0 ? rect.height : canvas.height);
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

/**
 * Компонует сцену в контекст через общий конвейер `composePlan` (единый источник
 * рендера для side panel и in-page оверлея): базовое изображение → деструктивная
 * замазка зон редакции по пикселям → оверлеи поверх (WYSIWYG). Устойчив к отсутствию
 * canvas-2d (jsdom): вызывается только при наличии контекста.
 */
function composeScene(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  annotations: readonly Annotation[],
): void {
  composePlan(ctx, img, buildRenderPlan(annotations));
}

export function ScreenshotPanel(): JSX.Element {
  const settings = useSettings(screenshotBinding);
  const ready = settings.ready.value;

  const [mode, setMode] = useState<CaptureMode>(screenshotBinding.value.value.mode);
  const [tool, setTool] = useState<AnnotationTool>(screenshotBinding.value.value.tool);
  const [color, setColor] = useState<string>(screenshotBinding.value.value.color);
  const [thickness, setThickness] = useState<number>(screenshotBinding.value.value.thickness);
  const [seeded, setSeeded] = useState(false);

  const [base, setBase] = useState<CaptureResult | null>(null);
  const [history, setHistory] = useState<History<Annotation[]>>(() =>
    createHistory<Annotation[]>([]),
  );
  const [draft, setDraft] = useState<Annotation | null>(null);
  // Инлайн-ввод подписи (Paint/Lightshot): точка в пикселях изображения + CSS-смещение
  // курсора-инпута внутри `.canvasWrap`. `null` — инпута нет.
  const [textEditor, setTextEditor] = useState<{ img: Point; left: number; top: number } | null>(
    null,
  );
  const [textValue, setTextValue] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imgReady, setImgReady] = useState(0);

  const { show } = useToast();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const seqRef = useRef(0);
  const sessionRef = useRef(0);

  const annotations = history.present;

  // Восстанавливаем сохранённые настройки один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    setMode(screenshotBinding.value.value.mode);
    setTool(screenshotBinding.value.value.tool);
    setColor(screenshotBinding.value.value.color);
    setThickness(screenshotBinding.value.value.thickness);
    setSeeded(true);
  }, [ready, seeded]);

  // Загружаем базовое изображение в ref при новом захвате; по `onload` — перерисовка.
  useEffect(() => {
    if (base === null) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = (): void => {
      imgRef.current = img;
      setImgReady((n) => n + 1);
    };
    img.src = base.dataUrl;
  }, [base]);

  // Перерисовка живого холста при изменении изображения/аннотаций/черновика.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (canvas === null || img === null || base === null) return;
    // `willReadFrequently: true`: живой холст перерисовывается на каждый pointermove
    // (в т.ч. при протяжке зоны замазки), а `composeScene` при наличии редакций
    // делает `getImageData`/`putImageData` — то есть частый readback. Без флага Chrome
    // держит холст на GPU и предупреждает о медленном многократном readback; флаг
    // просит CPU-backed холст, оптимизированный под это. Атрибут действует только на
    // ПЕРВОМ `getContext` для элемента — здесь это единственная точка доступа к его
    // контексту, поэтому применяется корректно.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) return; // среда без canvas-2d (напр. jsdom) — тихо пропускаем
    const list = draft === null ? annotations : [...annotations, draft];
    composeScene(ctx, img, list);
  }, [imgReady, annotations, draft, base]);

  // Автофокус инлайн-инпута подписи, как только он появился в точке клика.
  useEffect(() => {
    if (textEditor !== null) textInputRef.current?.focus();
  }, [textEditor]);

  // ── персист настроек ─────────────────────────────────────────────────────────

  const persistMode = (next: CaptureMode): void => {
    setMode(next);
    void screenshotBinding.update({ mode: next });
  };
  const persistTool = (next: AnnotationTool): void => {
    setTool(next);
    setTextEditor(null);
    void screenshotBinding.update({ tool: next });
  };
  const persistColor = (next: string): void => {
    setColor(next);
    void screenshotBinding.update({ color: next });
  };
  const persistThickness = (next: number): void => {
    const clamped = clampThickness(next);
    setThickness(clamped);
    void screenshotBinding.update({ thickness: clamped });
  };

  // ── захват ─────────────────────────────────────────────────────────────────

  const runCapture = async (captureMode: CaptureMode): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;
    setError('');
    setBusy(true);
    try {
      const result = await captureForMode(isCurrent, captureMode);
      if (!isCurrent() || result === null) return;
      setBase(result);
      setHistory(createHistory<Annotation[]>([]));
      setDraft(null);
      setTextEditor(null);
    } catch (e) {
      logger.error('screenshot.capture', e);
      if (isCurrent()) setError(t('screenshot.error.capture'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /** Захват по указанному режиму; возвращает результат или null (отказ/отмена/ошибка). */
  const captureForMode = async (
    isCurrent: () => boolean,
    captureMode: CaptureMode,
  ): Promise<CaptureResult | null> => {
    if (captureMode === 'visible') {
      const granted = await getBroker().ensure(CAPTURE_PERMS);
      if (!isCurrent()) return null;
      if (!granted) {
        setError(t('screenshot.error.permissionDenied'));
        return null;
      }
      return captureVisible();
    }

    const granted = await getBroker().ensure(INJECT_PERMS);
    if (!isCurrent()) return null;
    if (!granted) {
      setError(t('screenshot.error.permissionDenied'));
      return null;
    }
    const tabId = await tabs.queryActive();
    if (!isCurrent()) return null;
    if (tabId === undefined) {
      setError(t('screenshot.error.noTab'));
      return null;
    }

    if (captureMode === 'full') return captureFullPage(tabId);

    // Режим элемента: пикер → rect → кроп.
    const res = await sendMessage('inspection/pick', { tabId });
    if (!isCurrent()) return null;
    if (!res.ok) {
      setError(
        res.error.messageKey !== undefined
          ? t(res.error.messageKey)
          : t('screenshot.error.capture'),
      );
      return null;
    }
    const picked = asPicked(res.value);
    if (picked === null) {
      setError(t('screenshot.error.cancelled'));
      return null;
    }
    return captureElement(tabId, picked.rect);
  };

  // ── in-page («заморозка экрана», TASK-035) ────────────────────────────────────

  /** Загружает готовый кадр в редактор side panel (общий фолбэк-путь). */
  const loadFrameIntoPanel = (frame: CaptureResult): void => {
    setBase(frame);
    setHistory(createHistory<Annotation[]>([]));
    setDraft(null);
    setTextEditor(null);
  };

  /**
   * Запуск in-page редактора: снимаем кадр вьюпорта расширением (seam) и отдаём его
   * content-оверлею по RPC, который «замораживает» экран и ведёт редактирование на
   * месте. Экспорт (копирование/скачивание) происходит в content-мире; RPC резолвится
   * терминальным статусом. Честный фолбэк на side panel: заблокированная схема URL
   * (`chrome://`/Web Store/…) и сбой инъекции.
   */
  const runInPage = async (): Promise<void> => {
    if (busy) return;
    // In-page морозит видимую область вьюпорта (режим `visible`); диспетчеризация — в
    // `runForMode`.
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;
    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(INJECT_PERMS);
      if (!isCurrent()) return;
      if (!granted) {
        setError(t('screenshot.error.permissionDenied'));
        return;
      }
      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('screenshot.error.noTab'));
        return;
      }
      const url = await tabs.getUrl(tabId);
      if (!isCurrent()) return;
      if (!isInjectablePageUrl(url)) {
        // Служебная/привилегированная страница — in-page невозможен, снимаем в side panel.
        setError(t('screenshot.inPage.blockedFallback'));
        const frame = await captureVisible();
        if (!isCurrent()) return;
        loadFrameIntoPanel(frame);
        return;
      }

      const frame = await captureVisible();
      if (!isCurrent()) return;
      const res = await sendMessage('screenshot/editInPage', {
        tabId,
        image: frame.dataUrl,
        width: frame.width,
        height: frame.height,
        labels: inPageLabels(),
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        // Инъекция не удалась (привилегированная страница/нет хоста) — фолбэк в панель.
        logger.debug('screenshot.inPage.forward', res.error.code, res.error.message);
        setError(t('screenshot.inPage.blockedFallback'));
        loadFrameIntoPanel(frame);
        return;
      }
      const { status } = res.value;
      if (status === 'copied') show(t('screenshot.copied'), { severity: 'success' });
      else if (status === 'downloaded') show(t('screenshot.downloaded'), { severity: 'success' });
      else if (status === 'unavailable') {
        setError(t('screenshot.inPage.blockedFallback'));
        loadFrameIntoPanel(frame);
      }
      // 'cancelled' — пользователь закрыл оверлей (Esc); тихо, без ошибки.
    } catch (e) {
      logger.error('screenshot.inPage', e);
      if (isCurrent()) setError(t('screenshot.error.capture'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /**
   * Точка входа карточек-режимов idle (v3 Capture): пользователь выбирает «что снять»
   * прямо на экране запуска. Видимая область идёт in-page потоком («заморозка экрана» с
   * аннотированием прямо на странице); элемент и полная страница снимаются в редактор
   * side panel. Выбор персистится как последний режим.
   */
  const startCapture = (selected: CaptureMode): void => {
    persistMode(selected);
    if (selected === 'visible') {
      void runInPage();
    } else {
      void runCapture(selected);
    }
  };

  // ── рисование на холсте ──────────────────────────────────────────────────────

  const nextId = (): string => {
    const id = makeAnnotationId(seqRef.current);
    seqRef.current += 1;
    return id;
  };

  const onPointerDown = (e: PointerEvent): void => {
    const canvas = canvasRef.current;
    if (canvas === null || base === null) return;
    const p = eventToImagePoint(canvas, e);

    if (tool === 'text') {
      // Ставим инлайн-инпут прямо в точке клика (как в Paint): считаем CSS-смещение
      // курсора относительно скроллящегося контейнера холста.
      const wrap = wrapRef.current;
      const rect = (wrap ?? canvas).getBoundingClientRect();
      setTextValue('');
      setTextEditor({
        img: p,
        left: e.clientX - rect.left + (wrap?.scrollLeft ?? 0),
        top: e.clientY - rect.top + (wrap?.scrollTop ?? 0),
      });
      return;
    }

    draggingRef.current = true;
    canvas.setPointerCapture(e.pointerId);
    const common = { id: nextId(), color, thickness };
    if (tool === 'rectangle') {
      setDraft({ kind: 'rectangle', ...common, x: p.x, y: p.y, width: 0, height: 0 });
    } else if (tool === 'blur') {
      setDraft({ kind: 'blur', ...common, x: p.x, y: p.y, width: 0, height: 0 });
    } else if (tool === 'arrow') {
      setDraft({ kind: 'arrow', ...common, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else {
      setDraft({ kind: 'freehand', ...common, points: [p] });
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!draggingRef.current) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const p = eventToImagePoint(canvas, e);
    setDraft((prev) => {
      if (prev === null) return prev;
      switch (prev.kind) {
        case 'rectangle':
          return { ...prev, width: p.x - prev.x, height: p.y - prev.y };
        case 'blur':
          return { ...prev, width: p.x - prev.x, height: p.y - prev.y };
        case 'arrow':
          return { ...prev, x2: p.x, y2: p.y };
        case 'freehand':
          return { ...prev, points: [...prev.points, p] };
        case 'text':
          return prev;
      }
    });
  };

  const onPointerUp = (): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDraft((prev) => {
      if (prev !== null && isSignificant(prev)) {
        setHistory((h) => commitHistory(h, [...h.present, prev]));
      }
      return null;
    });
  };

  /** Фиксирует набранную подпись как аннотацию (Enter/blur); пустую — просто убирает. */
  const commitText = (): void => {
    const editor = textEditor;
    if (editor === null) return;
    const value = textValue.trim();
    if (value !== '') {
      const fontSize = Math.max(12, thickness * 6);
      const annotation: Annotation = {
        kind: 'text',
        id: nextId(),
        color,
        thickness,
        x: editor.img.x,
        y: editor.img.y,
        text: value,
        fontSize,
      };
      setHistory((h) => commitHistory(h, [...h.present, annotation]));
    }
    setTextEditor(null);
    setTextValue('');
  };

  /** Отмена инлайн-ввода без фиксации (Esc). */
  const cancelText = (): void => {
    setTextEditor(null);
    setTextValue('');
  };

  const onUndo = (): void => {
    setHistory((h) => undoHistory(h));
  };
  const onRedo = (): void => {
    setHistory((h) => redoHistory(h));
  };

  /** Возврат к экрану выбора режима (idle): отбрасываем снимок и правки. */
  const onRetake = (): void => {
    sessionRef.current += 1;
    setBase(null);
    setHistory(createHistory<Annotation[]>([]));
    setDraft(null);
    setTextEditor(null);
    setError('');
  };

  // ── экспорт ──────────────────────────────────────────────────────────────────

  /** Компонует финальную сцену в offscreen-canvas и отдаёт PNG-blob (или null). */
  const exportBlob = async (): Promise<Blob | null> => {
    const img = imgRef.current;
    if (img === null || base === null) return null;
    const canvas = document.createElement('canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    composeScene(ctx, img, annotations);
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  };

  const onCopy = (): void => {
    void (async (): Promise<void> => {
      try {
        const blob = await exportBlob();
        if (blob === null) {
          setError(t('screenshot.error.export'));
          return;
        }
        const ClipboardItemCtor = (globalThis as { ClipboardItem?: typeof ClipboardItem })
          .ClipboardItem;
        if (ClipboardItemCtor === undefined) throw new Error('ClipboardItem unavailable');
        await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
        show(t('screenshot.copied'), { severity: 'success' });
      } catch (e) {
        logger.error('screenshot.copy', e);
        setError(t('screenshot.error.copy'));
      }
    })();
  };

  const doDownload = (): void => {
    void (async (): Promise<void> => {
      try {
        const blob = await exportBlob();
        if (blob === null) {
          setError(t('screenshot.error.export'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = screenshotFileName(mode, new Date());
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        show(t('screenshot.downloaded'), { severity: 'success' });
      } catch (e) {
        logger.error('screenshot.download', e);
        setError(t('screenshot.error.export'));
      }
    })();
  };

  const hasImage = base !== null;
  const editHint =
    tool === 'blur'
      ? t('screenshot.blurHint')
      : tool === 'text'
        ? t('screenshot.textHint')
        : t('screenshot.drawHint');

  const idleOptions: { mode: CaptureMode; label: string; help: string }[] = [
    {
      mode: 'visible',
      label: t('screenshot.mode.visible'),
      help: t('screenshot.mode.visible.help'),
    },
    {
      mode: 'element',
      label: t('screenshot.mode.element'),
      help: t('screenshot.mode.element.help'),
    },
    { mode: 'full', label: t('screenshot.mode.full'), help: t('screenshot.mode.full.help') },
  ];

  return (
    <FeaturePanel bare description={t('feature.screenshot.desc')}>
      <div class={styles.panel} data-testid="screenshot">
        {error !== '' && (
          <p role="alert" class={styles.error} data-testid="screenshot-error">
            {error}
          </p>
        )}

        {/* ── IDLE: выбор «что снять» ── */}
        {!hasImage && (
          <>
            {idleOptions.map((o) => (
              <button
                key={o.mode}
                type="button"
                class={styles.optionRow}
                disabled={busy}
                onClick={() => {
                  startCapture(o.mode);
                }}
              >
                <span class={styles.optionText}>
                  <span class={styles.optionLabel}>{o.label}</span>
                  <span class={styles.optionHelp}>{o.help}</span>
                </span>
                <span class={styles.optionArrow} aria-hidden="true">
                  →
                </span>
              </button>
            ))}
            <span class={styles.idleNote}>{t('screenshot.idleNote')}</span>
          </>
        )}

        {/* ── EDIT: редактор аннотаций ── */}
        {hasImage && (
          <>
            <div
              class={styles.toolbar}
              role="toolbar"
              aria-label={t('screenshot.tools')}
              data-testid="screenshot-tools"
            >
              {TOOLS.map((tl) => (
                <button
                  key={tl}
                  type="button"
                  class={cn(styles.toolBtn, tool === tl && styles.toolBtnActive)}
                  aria-label={t(`screenshot.tool.${tl}`)}
                  title={t(`screenshot.tool.${tl}`)}
                  aria-pressed={tool === tl ? 'true' : 'false'}
                  onClick={() => {
                    persistTool(tl);
                  }}
                >
                  {TOOL_GLYPHS[tl]}
                </button>
              ))}
              <span class={styles.toolbarSpacer} />
              <button
                type="button"
                class={styles.iconBtn}
                disabled={!canUndo(history)}
                aria-label={t('screenshot.undo')}
                title={t('screenshot.undo')}
                onClick={onUndo}
              >
                ↶
              </button>
              <button
                type="button"
                class={styles.iconBtn}
                disabled={!canRedo(history)}
                aria-label={t('screenshot.redo')}
                title={t('screenshot.redo')}
                onClick={onRedo}
              >
                ↷
              </button>
            </div>

            <div class={styles.styleRow}>
              <div class={styles.palette} role="group" aria-label={t('screenshot.color')}>
                {SWATCHES.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    class={cn(styles.swatch, color === sw.hex && styles.swatchActive)}
                    style={{ background: sw.hex }}
                    aria-label={t(`screenshot.color.${sw.key}`)}
                    aria-pressed={color === sw.hex ? 'true' : 'false'}
                    onClick={() => {
                      persistColor(sw.hex);
                    }}
                  />
                ))}
              </div>
              <span class={styles.styleDivider} aria-hidden="true" />
              <div class={styles.widths} role="group" aria-label={t('screenshot.thickness')}>
                {WIDTHS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    class={cn(styles.widthBtn, thickness === w.value && styles.widthBtnActive)}
                    aria-label={t(`screenshot.width.${w.key}`)}
                    aria-pressed={thickness === w.value ? 'true' : 'false'}
                    onClick={() => {
                      persistThickness(w.value);
                    }}
                  >
                    <span class={styles.widthBar} style={{ height: `${String(w.value)}px` }} />
                  </button>
                ))}
              </div>
            </div>

            <div class={styles.canvasWrap} ref={wrapRef}>
              <canvas
                ref={canvasRef}
                class={styles.canvas}
                width={base.width}
                height={base.height}
                role="img"
                aria-label={t('screenshot.canvasLabel')}
                data-testid="screenshot-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
              <span class={styles.dimChip}>
                {base.width} × {base.height}
              </span>
              {textEditor !== null && (
                <input
                  ref={textInputRef}
                  type="text"
                  class={styles.textInput}
                  data-testid="screenshot-text-input"
                  style={{
                    left: `${String(textEditor.left)}px`,
                    top: `${String(textEditor.top)}px`,
                    color,
                    fontSize: `${String(Math.max(12, thickness * 6))}px`,
                  }}
                  value={textValue}
                  placeholder={t('screenshot.textPlaceholder')}
                  aria-label={t('screenshot.textLabel')}
                  onInput={(e) => {
                    setTextValue(e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitText();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelText();
                    }
                  }}
                  onBlur={commitText}
                />
              )}
            </div>

            <span class={styles.editHint}>{editHint}</span>

            <div class={styles.exportRow}>
              <Button block class={styles.primaryBtn} onClick={onCopy}>
                {t('screenshot.copy')}
              </Button>
              <Button variant="secondary" onClick={doDownload}>
                {t('screenshot.download')}
              </Button>
            </div>
            <Button variant="ghost" block onClick={onRetake}>
              {t('screenshot.retake')}
            </Button>
          </>
        )}
      </div>
    </FeaturePanel>
  );
}

/** Значима ли аннотация для фиксации (не вырожденный клик). */
function isSignificant(a: Annotation): boolean {
  switch (a.kind) {
    case 'rectangle':
    case 'blur':
      return Math.abs(a.width) >= 2 && Math.abs(a.height) >= 2;
    case 'arrow':
      return Math.hypot(a.x2 - a.x1, a.y2 - a.y1) >= 3;
    case 'freehand':
      return a.points.length >= 2;
    case 'text':
      return a.text.trim() !== '';
  }
}

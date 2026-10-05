/**
 * Адаптер захвата (TASK-027): три режима поверх platform-seam
 * `capture.visibleTab` (обёртка `chrome.tabs.captureVisibleTab`) и content-RPC
 * прокрутки (`screenshot/*`).
 *
 * Не входит в `logic.ts` (использует DOM: `Image`/`canvas`), поэтому живёт рядом —
 * вся детерминированная геометрия (кроп по DPR, план склейки) вынесена в `logic.ts`
 * и здесь только исполняется над реальными пикселями.
 *
 * Захват кадра — через platform-seam `capture.visibleTab`
 * (`chrome.tabs.captureVisibleTab`), единственную точку доступа к платформе (ADR-0014).
 */
import { capture } from '@/platform';
import { sendMessage } from '@/shared/messaging/bus';
import { cropRectToPixels, clampPixelRect, planFullPageStitch } from './logic';
import type { CaptureResult, Rect } from './types';

/** Интервал между кадрами: `captureVisibleTab` троттлится (~2 вызова/сек). */
const CAPTURE_INTERVAL_MS = 550;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ждёт следующего кадра отрисовки (перерисовка после прокрутки). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/** Грузит dataURL в `HTMLImageElement` (для измерения размеров и рисования). */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => {
      resolve(img);
    };
    img.onerror = (): void => {
      reject(new Error('image decode failed'));
    };
    img.src = dataUrl;
  });
}

/** Создаёт 2D-контекст холста заданного размера (или бросает, если canvas недоступен). */
function makeCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return { canvas, ctx };
}

/** Захват видимой области активной вкладки. Размеры — натуральные (device px). */
export async function captureVisible(): Promise<CaptureResult> {
  const dataUrl = await capture.visibleTab({ format: 'png' });
  const img = await loadImage(dataUrl);
  return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
}

/**
 * Захват выбранного элемента: снимок видимой области → кроп по `rect` (CSS px
 * вьюпорта) с учётом DPR страницы (из `screenshot/metrics`). Элемент должен быть
 * во вьюпорте — вне видимой области кроп зажимается в границы кадра.
 */
export async function captureElement(tabId: number, rect: Rect): Promise<CaptureResult> {
  const metrics = await sendMessage('screenshot/metrics', { tabId });
  const dpr = metrics.ok ? metrics.value.dpr : 1;

  const base = await captureVisible();
  const img = await loadImage(base.dataUrl);

  const crop = clampPixelRect(cropRectToPixels(rect, dpr), base.width, base.height);
  if (crop.sw <= 0 || crop.sh <= 0) throw new Error('element out of viewport');

  const { canvas, ctx } = makeCanvas(crop.sw, crop.sh);
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
  return { dataUrl: canvas.toDataURL('image/png'), width: crop.sw, height: crop.sh };
}

/**
 * Захват полной страницы склейкой (best-effort): метрики → план (`planFullPageStitch`)
 * → цикл «прокрутить (RPC) → снять кадр (seam) → нарисовать срез». В конце прокрутка
 * восстанавливается (`screenshot/reset`). Sticky/fixed-элементы и ленивый контент при
 * склейке могут задваиваться/смещаться — ограничение отражено в UI (не пиксель-перфект).
 */
export async function captureFullPage(tabId: number): Promise<CaptureResult> {
  const metrics = await sendMessage('screenshot/metrics', { tabId });
  if (!metrics.ok) throw new Error('metrics failed');

  const plan = planFullPageStitch({
    docHeight: metrics.value.docH,
    viewportHeight: metrics.value.viewportH,
    viewportWidth: metrics.value.viewportW,
    dpr: metrics.value.dpr,
  });

  const { canvas, ctx } = makeCanvas(plan.width, plan.height);

  for (const [index, step] of plan.steps.entries()) {
    const scrolled = await sendMessage('screenshot/scrollStep', { tabId, scrollY: step.scrollY });
    if (!scrolled.ok) throw new Error('scroll failed');
    await nextFrame();
    // Троттлинг captureVisibleTab: пропускаем ожидание перед самым первым кадром.
    if (index > 0) await delay(CAPTURE_INTERVAL_MS);

    const dataUrl = await capture.visibleTab({ format: 'png' });
    const frame = await loadImage(dataUrl);
    ctx.drawImage(
      frame,
      0,
      step.sourceYDevice,
      frame.naturalWidth,
      step.sliceHeightDevice,
      0,
      step.destYDevice,
      frame.naturalWidth,
      step.sliceHeightDevice,
    );
  }

  await sendMessage('screenshot/reset', { tabId });
  return { dataUrl: canvas.toDataURL('image/png'), width: plan.width, height: plan.height };
}

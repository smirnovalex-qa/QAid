/**
 * Чистая геометрия in-page редактора скриншота (TASK-035): прямоугольник выделения,
 * ресайз/сдвиг за ручки, клэмп инлайн-тулбара во вьюпорт и перевод CSS-региона в
 * device-пиксельный кроп. Плюс чистый предикат «инжектируема ли вкладка» для честного
 * фолбэка на side panel.
 *
 * БЕЗ DOM/preact/@platform/chrome: только числа/строки и сериализуемые структуры,
 * поэтому полностью юнит-тестируется без браузера (как `shared/inspection/ruler/*`).
 * Слой ввода (pointer), рендер оверлея и мост RPC живут в
 * `content/inspection/screenshot-editor.ts`; сюда вынесена вся детерминированная
 * геометрия, чтобы её можно было проверить без песочницы.
 *
 * Единицы: регион и тулбар — CSS-пиксели вьюпорта (координаты `clientX/clientY`);
 * `regionToDeviceCrop` умножает на DPR, давая целочисленный кроп в device px —
 * ту же систему координат, что и захваченный кадр (`captureVisibleTab`).
 */

/** Точка во вьюпорте (CSS px). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Прямоугольник (CSS px). До нормализации размеры могут быть отрицательными. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Размеры вьюпорта/элемента (CSS px). */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Целочисленный кроп в device px (совместим с `PixelRect` фичи). */
export interface DeviceCrop {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * Ручка выделения: 8 по периметру (углы + середины сторон) для ресайза и `move` для
 * перетаскивания целиком. `null` — курсор вне выделения и ручек.
 */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

/** Минимальная сторона значимого выделения (CSS px) — меньше считаем случайным кликом. */
export const MIN_REGION_SIZE = 8;

/** Нормализует прямоугольник к неотрицательным размерам (drag из любого угла). */
export function normalizeRect(rect: Rect): Rect {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return { x, y, width: Math.abs(rect.width), height: Math.abs(rect.height) };
}

/** Прямоугольник по двум углам (drag), уже нормализованный. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return normalizeRect({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y });
}

/** Значимо ли выделение (не вырожденный клик). */
export function isSignificantRegion(rect: Rect): boolean {
  const n = normalizeRect(rect);
  return n.width >= MIN_REGION_SIZE && n.height >= MIN_REGION_SIZE;
}

/** Точка внутри прямоугольника (границы включительно). */
export function isInside(rect: Rect, p: Point): boolean {
  const n = normalizeRect(rect);
  return p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height;
}

/** Центры восьми ручек по периметру (CSS px). */
export function handlePoints(rect: Rect): Record<Exclude<Handle, 'move'>, Point> {
  const n = normalizeRect(rect);
  const midX = n.x + n.width / 2;
  const midY = n.y + n.height / 2;
  const right = n.x + n.width;
  const bottom = n.y + n.height;
  return {
    nw: { x: n.x, y: n.y },
    n: { x: midX, y: n.y },
    ne: { x: right, y: n.y },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: n.x, y: bottom },
    w: { x: n.x, y: midY },
  };
}

/**
 * Ручка под точкой: сначала ближайшая ресайз-ручка в пределах `handleSize`, затем —
 * `move`, если точка внутри выделения; иначе `null`. Порядок важен: ручки на кромке
 * имеют приоритет над перетаскиванием тела.
 */
export function handleAt(rect: Rect, p: Point, handleSize: number): Handle | null {
  const radius = Math.max(1, handleSize) / 2 + 2;
  const points = handlePoints(rect);
  let best: Exclude<Handle, 'move'> | null = null;
  let bestDist = Infinity;
  for (const key of Object.keys(points) as Exclude<Handle, 'move'>[]) {
    const c = points[key];
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d <= radius && d < bestDist) {
      best = key;
      bestDist = d;
    }
  }
  if (best !== null) return best;
  return isInside(rect, p) ? 'move' : null;
}

/**
 * Ресайз выделения перетаскиванием ручки на (`dx`,`dy`). Двигает только те кромки,
 * что закреплены за ручкой; поддерживает минимальный размер и переворот через
 * нормализацию (тянем верх ниже низа — прямоугольник корректно инвертируется).
 */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number): Rect {
  const n = normalizeRect(rect);
  let left = n.x;
  let top = n.y;
  let right = n.x + n.width;
  let bottom = n.y + n.height;

  if (handle === 'nw' || handle === 'w' || handle === 'sw') left += dx;
  if (handle === 'ne' || handle === 'e' || handle === 'se') right += dx;
  if (handle === 'nw' || handle === 'n' || handle === 'ne') top += dy;
  if (handle === 'sw' || handle === 's' || handle === 'se') bottom += dy;
  if (handle === 'move') {
    left += dx;
    right += dx;
    top += dy;
    bottom += dy;
  }

  return normalizeRect({ x: left, y: top, width: right - left, height: bottom - top });
}

/** Сдвиг выделения на (`dx`,`dy`) с зажимом в границы вьюпорта. */
export function moveRect(rect: Rect, dx: number, dy: number, viewport: Size): Rect {
  const n = normalizeRect(rect);
  const maxX = Math.max(0, viewport.width - n.width);
  const maxY = Math.max(0, viewport.height - n.height);
  const x = Math.min(Math.max(0, n.x + dx), maxX);
  const y = Math.min(Math.max(0, n.y + dy), maxY);
  return { x, y, width: n.width, height: n.height };
}

/** Зажимает прямоугольник в границы вьюпорта (кромки не выходят за экран). */
export function clampRectToViewport(rect: Rect, viewport: Size): Rect {
  const n = normalizeRect(rect);
  const x = Math.min(Math.max(0, n.x), viewport.width);
  const y = Math.min(Math.max(0, n.y), viewport.height);
  const width = Math.min(n.width, viewport.width - x);
  const height = Math.min(n.height, viewport.height - y);
  return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
}

/**
 * Позиция инлайн-тулбара относительно выделения, зажатая во вьюпорт. Приоритет:
 * под выделением → над ним → внутри у нижней кромки (крупное выделение во весь
 * экран). По X — прижата к левому краю выделения, но не вылезает за вьюпорт.
 */
export function toolbarPosition(
  region: Rect,
  toolbar: Size,
  viewport: Size,
  margin: number,
): Point {
  const n = normalizeRect(region);
  const gap = Math.max(0, margin);

  const below = n.y + n.height + gap;
  const above = n.y - toolbar.height - gap;
  let y: number;
  if (below + toolbar.height <= viewport.height) {
    y = below;
  } else if (above >= 0) {
    y = above;
  } else {
    // Ни снизу, ни сверху не помещается — прижимаем к низу выделения внутри экрана.
    y = Math.max(
      gap,
      Math.min(n.y + n.height - toolbar.height - gap, viewport.height - toolbar.height - gap),
    );
  }
  y = Math.min(Math.max(gap, y), Math.max(gap, viewport.height - toolbar.height - gap));

  const maxX = Math.max(gap, viewport.width - toolbar.width - gap);
  const x = Math.min(Math.max(gap, n.x), maxX);

  return { x, y };
}

/**
 * Перевод CSS-региона вьюпорта в целочисленный device-пиксельный кроп: нормализация →
 * умножение на DPR → округление → отсечение отрицательных, с зажимом в размеры кадра.
 * Тождественно `cropRectToPixels`+`clampPixelRect` фичи, но без зависимости от
 * feature-слоя (инспекционный бандл не импортирует фичи).
 */
export function regionToDeviceCrop(region: Rect, dpr: number, frame: Size): DeviceCrop {
  const scale = dpr > 0 ? dpr : 1;
  const n = normalizeRect(region);
  const sx0 = Math.max(0, Math.round(n.x * scale));
  const sy0 = Math.max(0, Math.round(n.y * scale));
  const sw0 = Math.max(0, Math.round(n.width * scale));
  const sh0 = Math.max(0, Math.round(n.height * scale));
  const sx = Math.min(sx0, frame.width);
  const sy = Math.min(sy0, frame.height);
  const sw = Math.max(0, Math.min(sw0, frame.width - sx));
  const sh = Math.max(0, Math.min(sh0, frame.height - sy));
  return { sx, sy, sw, sh };
}

/**
 * Чистый предикат: можно ли инъектировать content-скрипт (и, значит, запустить
 * in-page редактор) на странице с таким URL. `false` для служебных схем и особых
 * страниц, где инъекция запрещена политикой браузера (`chrome://`, Web Store,
 * `view-source:`, страницы расширений, `file://` без тумблера, PDF-вьюер и т.п.) —
 * тогда UI честно уводит в редактор side panel.
 *
 * `undefined`/пустой URL трактуем как неинжектируемый (не смогли определить — не
 * рискуем «тихо упасть»).
 */
export function isInjectablePageUrl(url: string | undefined): boolean {
  if (url === undefined || url === '') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return false;

  const host = parsed.hostname.toLowerCase();
  // Chrome Web Store — привилегированная страница: инъекция контента запрещена.
  if (host === 'chrome.google.com' && parsed.pathname.toLowerCase().startsWith('/webstore')) {
    return false;
  }
  if (host === 'chromewebstore.google.com') return false;
  // Явно заблокированный PDF-вьюер отдаётся как http(s) с расширением .pdf в некоторых
  // случаях — но это не служебная страница; content-скрипт в PDF-вьюер Chrome не
  // инъектируется. Определить надёжно по URL нельзя, поэтому оставляем на фолбэк по
  // ошибке инъекции (RPC вернёт ошибку → UI уводит в side panel).
  return true;
}

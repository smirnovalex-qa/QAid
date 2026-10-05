/**
 * Примитивы инспекции DOM и цвета — общий математический фундамент для будущих
 * фич WCAG-контраста и палитры (TASK-013). Чистые функции без побочных эффектов
 * (кроме `effectiveBackground`/`walk`, читающих стили через инъектируемый
 * `getStyle`). Слой не зависит от платформы, `preact` или `chrome.*` — только
 * стандартные DOM-глобалы. Комментарии — на русском, идентификаторы — на английском.
 */

/** Цвет RGBA. `r`,`g`,`b` — целые 0..255; `a` — 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Ограничивает число диапазоном `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Минимальный набор именованных цветов. По ТЗ обязательны `transparent`, `black`
 * и `white`; несколько базовых добавлены для устойчивости к типичному вводу.
 */
const NAMED_COLORS: Readonly<Record<string, Rgba>> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
};

/** Регэксп числа CSS (целое/дробное, необязательный знак, необязательный `%`). */
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)%?$/;

/** Парсит канал r/g/b: число 0..255 или проценты. Возвращает null на мусоре. */
function parseChannel255(token: string): number | null {
  if (!NUMBER_RE.test(token)) return null;
  const isPct = token.endsWith('%');
  const num = Number.parseFloat(isPct ? token.slice(0, -1) : token);
  if (Number.isNaN(num)) return null;
  const value = isPct ? (num / 100) * 255 : num;
  return clamp(Math.round(value), 0, 255);
}

/** Парсит альфу: число 0..1 или проценты. Возвращает null на мусоре. */
function parseAlpha(token: string): number | null {
  if (!NUMBER_RE.test(token)) return null;
  const isPct = token.endsWith('%');
  const num = Number.parseFloat(isPct ? token.slice(0, -1) : token);
  if (Number.isNaN(num)) return null;
  const value = isPct ? num / 100 : num;
  return clamp(value, 0, 1);
}

/** Парсит тон в градусах (допускает суффикс `deg`), приводит к `[0, 360)`. */
function parseHue(token: string): number | null {
  const raw = token.endsWith('deg') ? token.slice(0, -3) : token;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return null;
  const num = Number.parseFloat(raw);
  if (Number.isNaN(num)) return null;
  return ((num % 360) + 360) % 360;
}

/** Парсит процент насыщенности/светлоты в `[0, 1]`. Требует суффикс `%`. */
function parsePercent01(token: string): number | null {
  if (!token.endsWith('%')) return null;
  const num = Number.parseFloat(token.slice(0, -1));
  if (Number.isNaN(num)) return null;
  return clamp(num / 100, 0, 1);
}

/** Конвертация HSL→RGB. `h` в `[0,360)`, `s`/`l` в `[0,1]`. Возвращает целые 0..255. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Разбирает `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` (без ведущего `#`). */
function parseHex(hex: string): Rgba | null {
  if (!/^[0-9a-f]+$/.test(hex)) return null;
  const len = hex.length;
  if (len !== 3 && len !== 4 && len !== 6 && len !== 8) return null;
  const full =
    len === 3 || len === 4
      ? Array.from(hex)
          .map((ch) => ch + ch)
          .join('')
      : hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const a = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/**
 * Парсит CSS-цвет: `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`, `rgb()`/`rgba()`,
 * `hsl()`/`hsla()`, `transparent` и базовые именованные. Поддерживает и запятую,
 * и modern space/slash синтаксис (напр. `rgb(255 0 0 / 50%)`), проценты в альфе
 * и терпима к пробелам. Возвращает `null` на неразбираемом или NaN-вводе.
 */
export function parseColor(input: string): Rgba | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === '') return null;

  const named = NAMED_COLORS[s];
  if (named) return { ...named };

  if (s.startsWith('#')) return parseHex(s.slice(1));

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (!fn) return null;
  const kind = fn[1];
  if (kind === undefined) return null;
  const body = fn[2] ?? '';

  // Унифицируем разделители: и запятая, и `/` (modern-альфа) становятся пробелом.
  const tokens = body
    .replace(/[,/]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '');
  if (tokens.length < 3 || tokens.length > 4) return null;

  const t0 = tokens[0];
  const t1 = tokens[1];
  const t2 = tokens[2];
  const t3 = tokens[3];
  if (t0 === undefined || t1 === undefined || t2 === undefined) return null;

  let alpha = 1;
  if (t3 !== undefined) {
    const parsed = parseAlpha(t3);
    if (parsed === null) return null;
    alpha = parsed;
  }

  if (kind.startsWith('rgb')) {
    const r = parseChannel255(t0);
    const g = parseChannel255(t1);
    const b = parseChannel255(t2);
    if (r === null || g === null || b === null) return null;
    return { r, g, b, a: alpha };
  }

  // hsl / hsla
  const h = parseHue(t0);
  const sat = parsePercent01(t1);
  const light = parsePercent01(t2);
  if (h === null || sat === null || light === null) return null;
  const { r, g, b } = hslToRgb(h, sat, light);
  return { r, g, b, a: alpha };
}

/** Сериализация в строку `rgba(r, g, b, a)`. */
export function toRgba(c: Rgba): string {
  return `rgba(${String(c.r)}, ${String(c.g)}, ${String(c.b)}, ${String(c.a)})`;
}

/** Линеаризация одного sRGB-канала (0..255 → 0..1) по формуле WCAG 2.1. */
function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Относительная яркость по WCAG 2.1 (учитывает только r,g,b, игнорит alpha). 0..1. */
export function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const r = linearizeChannel(c.r);
  const g = linearizeChannel(c.g);
  const b = linearizeChannel(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Контраст по WCAG 2.1: `(L1 + 0.05) / (L2 + 0.05)`, где `L1` — более светлый.
 * Диапазон 1..21.
 */
export function contrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Композиция «source-over»: `over` (непрозрачный/полупрозрачный) поверх `under`.
 * Возвращает Rgba с целыми каналами и результирующей альфой.
 */
export function blend(over: Rgba, under: Rgba): Rgba {
  const outA = over.a + under.a * (1 - over.a);
  if (outA === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (o: number, u: number): number =>
    Math.round((o * over.a + u * under.a * (1 - over.a)) / outA);
  return {
    r: mix(over.r, under.r),
    g: mix(over.g, under.g),
    b: mix(over.b, under.b),
    a: outA,
  };
}

/** Дефолтный источник вычисленных стилей — глобальный `getComputedStyle`. */
const defaultGetStyle = (el: Element): CSSStyleDeclaration => getComputedStyle(el);

/**
 * Data-атрибут хоста оверлея инспектора (закрытый Shadow DOM, TASK-013). Дублирован
 * из `content/inspection/overlay.ts` СПЕЦИАЛЬНО: `shared` не зависит от `content`, но
 * и обход (`walk`), и навигация по иерархии (`navigation.ts`) обязаны исключать
 * собственный оверлей — источник правды атрибута один (эта константа), а не строковый
 * литерал, разбросанный по слоям.
 */
export const OVERLAY_HOST_ATTR = 'data-qatb-overlay';

/**
 * Data-атрибут хоста откреплённой плавающей панели (closed Shadow DOM, TASK-062).
 * Дублирован из `content/panel/frame.ts` по той же причине, что и {@link OVERLAY_HOST_ATTR}:
 * `shared` не зависит от `content`, но инспекция/навигация обязаны исключать и саму панель —
 * иначе живой инспектор (TASK-056) «видел» бы и подсвечивал плавающую панель как элемент
 * страницы. Источник правды атрибута один (эта константа).
 */
export const PANEL_HOST_ATTR = 'data-qatb-panel';

/**
 * Единый селектор собственных UI-хостов расширения, исключаемых из обходов/пикера
 * инспекции: оверлей подсветки и плавающая панель. Один источник для `walk`/навигации
 * ([dom.ts]) и пикера ([content/inspection/picker.ts], [content/inspection/host.ts]).
 */
export const IGNORED_UI_SELECTOR = `[${OVERLAY_HOST_ATTR}], [${PANEL_HOST_ATTR}]`;

/**
 * Служебные (нерендеримые) теги, не несущие визуального контента страницы. Инспекция
 * и навигация по иерархии их пропускают: провалиться в `<script>`/`<style>` смысла нет.
 */
const NON_RENDERED_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'link',
  'meta',
  'template',
  'noscript',
  'head',
  'title',
  'base',
]);

/** Опции предиката «значимости» элемента. */
export interface SignificanceOptions {
  /** Источник вычисленных стилей (инъекция для тестов). По умолчанию — `getComputedStyle`. */
  getStyle?: (el: Element) => CSSStyleDeclaration;
  /** Считать `display:none` незначимым. По умолчанию `true` (как в обходе). */
  skipHidden?: boolean;
}

/**
 * Принадлежит ли узел собственному UI-хосту расширения (оверлею инспектора ИЛИ
 * плавающей панели) — он сам или его потомок. Так инспекция не «видит» ни подсветку,
 * ни откреплённую панель как элемент страницы (TASK-062).
 */
function isOwnUiNode(el: Element): boolean {
  // `closest` учитывает и хост, и любой узел внутри его (Shadow-)поддерева;
  // фолбэк на `hasAttribute` — для сред без `closest` (устойчивость к экзотике).
  if (typeof el.closest === 'function') {
    return el.closest(IGNORED_UI_SELECTOR) !== null;
  }
  return el.hasAttribute(OVERLAY_HOST_ATTR) || el.hasAttribute(PANEL_HOST_ATTR);
}

/**
 * Единый предикат «значимого» для инспекции элемента — общий источник правил для
 * обхода `walk` и навигации по DOM-иерархии (`navigation.ts`, TASK-052). Незначимы:
 * собственные UI-хосты расширения (`[data-qatb-overlay]`/`[data-qatb-panel]` и их
 * поддеревья), служебные нерендеримые теги (`script`/`style`/…) и (если `skipHidden`)
 * узлы `display:none`. Так поведение обхода и навигации не расходится — оба зовут одну
 * функцию.
 */
export function isInspectableElement(el: Element, options: SignificanceOptions = {}): boolean {
  const skipHidden = options.skipHidden ?? true;
  const getStyle = options.getStyle ?? defaultGetStyle;
  if (isOwnUiNode(el)) return false;
  if (NON_RENDERED_TAGS.has(el.tagName.toLowerCase())) return false;
  if (skipHidden && getStyle(el).display === 'none') return false;
  return true;
}

/** Непрозрачный белый — «дно» композиции фона, если вся цепочка прозрачна. */
const OPAQUE_WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * Эффективный фон элемента: поднимается по предкам, компонуя `background-color`
 * с учётом alpha, пока фон не станет непрозрачным или не кончатся предки. Если до
 * корня всё прозрачно — фон считается белым (255,255,255,1). Второй аргумент —
 * инъекция источника стилей для тестов (по умолчанию глобальный getComputedStyle).
 */
export function effectiveBackground(
  el: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): Rgba {
  const bgOf = (node: Element): Rgba =>
    parseColor(getStyle(node).backgroundColor) ?? { r: 0, g: 0, b: 0, a: 0 };

  let acc = bgOf(el);
  let node: Element | null = el.parentElement;
  while (acc.a < 1 && node !== null) {
    acc = blend(acc, bgOf(node));
    node = node.parentElement;
  }
  if (acc.a < 1) acc = blend(acc, OPAQUE_WHITE);
  return acc;
}

/** Опции обхода DOM. */
export interface WalkOptions {
  /** Максимум посещаемых узлов (бюджет). Обход прекращается по достижении. PRD: до 10k без лага. */
  budget: number;
  /** Предикат исключения поддерева (напр. собственный оверлей-хост инспектора). Возвращает true — узел и его потомки пропускаются. */
  exclude?: (el: Element) => boolean;
  /** Пропускать невидимые (display:none). По умолчанию true. Используй getStyle. */
  skipHidden?: boolean;
  getStyle?: (el: Element) => CSSStyleDeclaration;
}

/**
 * Обход DOM в глубину с бюджетом узлов и ранним выходом. Возвращает собранные
 * элементы (в порядке обхода, pre-order), не больше `budget`. Исключает поддеревья
 * по `exclude` и (если `skipHidden`) невидимые. Корень включается, если проходит
 * фильтры. Поддерево `display:none` пропускается целиком (потомки не рендерятся).
 */
export function walk(root: Element, options: WalkOptions): Element[] {
  const { budget, exclude } = options;
  const skipHidden = options.skipHidden ?? true;
  const getStyle = options.getStyle ?? defaultGetStyle;

  const out: Element[] = [];
  if (budget <= 0) return out;

  const visit = (el: Element): void => {
    if (out.length >= budget) return;
    if (exclude?.(el) === true) return;
    // Единые правила «значимости» (оверлей/служебные теги/`display:none`) — из
    // `isInspectableElement`, чтобы обход и навигация не расходились (TASK-052).
    if (!isInspectableElement(el, { getStyle, skipHidden })) return;
    out.push(el);
    if (out.length >= budget) return;
    for (const child of Array.from(el.children)) {
      if (out.length >= budget) return;
      visit(child);
    }
  };

  visit(root);
  return out;
}

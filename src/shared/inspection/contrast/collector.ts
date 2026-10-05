/**
 * DOM-сборщик контраста (TASK-014). Чистый модуль без саморегистрации и без импортов
 * из `@/content/**`: экспортирует id и функцию `collectContrast`, которую content-хост
 * (TASK-013) регистрирует через `registerInspector` — проводку делает оркестратор.
 *
 * Обходит видимые текстонесущие узлы с бюджетом, снимает цвет текста и ЭФФЕКТИВНЫЙ фон
 * (композитинг альфы по предкам, `effectiveBackground`), вычисляет `contrastRatio` и
 * детектирует «крупный текст» по вычисленным px/weight. Фон-градиент/картинка честно
 * помечается `approximate` (точная оценка невозможна). Оверлей инспектора исключается.
 * Все результаты — plain-объекты (никаких DOM-узлов наружу).
 */
import {
  blend,
  contrastRatio,
  effectiveBackground,
  parseColor,
  walk,
} from '@/shared/inspection/dom';
import type { Rgba } from '@/shared/inspection/dom';
import { isLargeText } from './logic';
import type { ContrastSample, ContrastScanData } from './types';

/** Публичный id сборщика — под ним хост регистрирует его в реестре инспекторов. */
export const CONTRAST_INSPECTOR_ID = 'contrast';

/** Бюджет узлов обхода (PRD 9: до 10k без лага). */
const NODE_BUDGET = 10000;

/** Максимальная длина фрагмента текста для отображения. */
const MAX_TEXT_LEN = 120;

/** Дефолтный источник вычисленных стилей — глобальный `getComputedStyle`. */
const defaultGetStyle = (el: Element): CSSStyleDeclaration => getComputedStyle(el);

/** Короткий человекочитаемый селектор `tag#id.cls` (тот же стиль, что у слоя). */
function shortSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  const classes = Array.from(el.classList)
    .map((cls) => `.${cls}`)
    .join('');
  return tag + (id !== null && id !== '' ? `#${id}` : '') + classes;
}

/** Есть ли у элемента собственный непустой текст (прямой text-node, а не у потомков). */
function ownText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      out += node.textContent ?? '';
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Приближённый ли фон под текстом: если на пути к первому непрозрачному фону
 * встречается `background-image` (градиент/картинка) — точная оценка невозможна.
 * Поднимается по предкам так же, как `effectiveBackground` компонует цвет.
 */
function backgroundIsApproximate(
  el: Element,
  getStyle: (el: Element) => CSSStyleDeclaration,
): boolean {
  let node: Element | null = el;
  while (node !== null) {
    const style = getStyle(node);
    const image = style.backgroundImage;
    if (image !== '' && image !== 'none') return true;
    const bg = parseColor(style.backgroundColor);
    if (bg !== null && bg.a >= 1) return false; // непрозрачный фон закрыл всё ниже
    node = node.parentElement;
  }
  return false;
}

/** Парсит вычисленный `font-weight` в число (нормализуя ключевые слова). */
function parseWeight(raw: string): number {
  if (raw === 'bold') return 700;
  if (raw === 'normal') return 400;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 400 : n;
}

/**
 * Собирает пары «текст/фон» в пределах `root`. Второй аргумент — инъекция источника
 * стилей для тестируемости (по умолчанию глобальный `getComputedStyle`), как у
 * `effectiveBackground`.
 */
export function collectContrast(
  root: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): ContrastScanData {
  const visitedEls = walk(root, {
    budget: NODE_BUDGET,
    // Оборонительно исключаем оверлей инспектора (он живёт под <html>, вне <body>).
    exclude: (el) => el.hasAttribute('data-qatb-overlay'),
    getStyle,
  });

  const samples: ContrastSample[] = [];
  for (const el of visitedEls) {
    const text = ownText(el);
    if (text === '') continue;

    const style = getStyle(el);
    const fgRaw = parseColor(style.color);
    if (fgRaw === null) continue;

    const bg = effectiveBackground(el, getStyle);
    // Полупрозрачный текст композитим на фон — иначе контраст завышен.
    const fg: Rgba = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;

    const px = Number.parseFloat(style.fontSize);
    const size = Number.isNaN(px) ? 16 : px;
    const weight = parseWeight(style.fontWeight);

    samples.push({
      selector: shortSelector(el),
      text: text.length > MAX_TEXT_LEN ? `${text.slice(0, MAX_TEXT_LEN)}…` : text,
      fg,
      bg,
      ratio: contrastRatio(fg, bg),
      large: isLargeText(size, weight),
      approximate: backgroundIsApproximate(el, getStyle),
    });
  }

  return {
    samples,
    visited: visitedEls.length,
    budget: NODE_BUDGET,
    truncated: visitedEls.length >= NODE_BUDGET,
  };
}

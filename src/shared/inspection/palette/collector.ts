/**
 * Сборщик палитры цветов (TASK-015): обходит видимые элементы корня с бюджетом,
 * снимает цветовые CSS-свойства пачкой, нормализует токены через `parseColor`
 * (единый парсер слоя) и агрегирует в дедуплицированные записи.
 *
 * ЧИСТЫЙ модуль: НЕ импортирует `@/content/**`, НЕ вызывает `registerInspector`.
 * Зависит только от примитивов слоя (`@/shared/inspection/dom`) и своей логики.
 * Устойчив к сложным значениям (`box-shadow`/градиенты) — извлекает распознанные
 * цветовые токены, не бросая на непарсибельном. Выход JSON-сериализуем.
 */
import { parseColor, walk } from '@/shared/inspection/dom';
import type { Rgba } from '@/shared/inspection/dom';
import { aggregatePalette, sortPalette } from './logic';
import type { PaletteHit, PaletteScanData } from './types';

/** Идентификатор инспектора (для RPC `inspection/scan|collect`). */
export const PALETTE_INSPECTOR_ID = 'palette';

/** Бюджет узлов обхода (PRD: до 10k без лага). */
const NODE_BUDGET = 10000;

/** Максимум классов в лёгком селекторе элемента. */
const MAX_SELECTOR_CLASSES = 2;

/**
 * Простые цветовые свойства: значение — один цветовой токен. Имена — kebab-case
 * (совместимо с `getPropertyValue`). `fill`/`stroke` — SVG; на не-SVG вернут
 * пустое/`none`, что `parseColor` отбросит.
 */
const SIMPLE_PROPS: readonly string[] = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
];

/**
 * Строковые свойства со сложным синтаксисом: могут нести несколько цветовых
 * токенов (тени, градиенты). Парсим устойчиво регэкспом.
 */
const STRING_PROPS: readonly string[] = ['box-shadow', 'background-image'];

/** Функциональные цветовые токены в вычисленных стилях (`rgb()/rgba()/hsl()/hsla()`). */
const FUNC_COLOR_RE = /(?:rgba?|hsla?)\([^)]*\)/gi;
/** HEX-токены (`#rgb`..`#rrggbbaa`) — редки в computed, но извлекаем на всякий. */
const HEX_COLOR_RE = /#[0-9a-f]{3,8}\b/gi;

/** Дефолтный источник вычисленных стилей — глобальный `getComputedStyle`. */
const defaultGetStyle = (el: Element): CSSStyleDeclaration => getComputedStyle(el);

/** Предикат исключения собственного оверлея инспектора из обхода. */
function isOverlay(el: Element): boolean {
  return el.hasAttribute('data-qatb-overlay');
}

/** Безопасно читает CSS-свойство; на ошибке/отсутствии — пустая строка. */
function safeGetProperty(style: CSSStyleDeclaration, name: string): string {
  try {
    return style.getPropertyValue(name);
  } catch {
    return '';
  }
}

/** Лёгкий селектор элемента: `tag#id.class1.class2` (устойчив к SVG-className). */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id !== '' ? `#${el.id}` : '';
  const classes = Array.from(el.classList).slice(0, MAX_SELECTOR_CLASSES);
  const cls = classes.length > 0 ? `.${classes.join('.')}` : '';
  return `${tag}${id}${cls}`;
}

/**
 * Извлекает распознаваемые цветовые токены из сложного строкового значения
 * (`box-shadow`, градиент). Никогда не бросает: собирает совпадения обоих
 * регэкспов, нормализует через `parseColor`, отбрасывает нераспознанное.
 */
function extractColorsFromString(value: string): Rgba[] {
  if (value === '' || value === 'none') return [];
  const out: Rgba[] = [];
  try {
    const matches = [...value.matchAll(FUNC_COLOR_RE), ...value.matchAll(HEX_COLOR_RE)];
    for (const m of matches) {
      const parsed = parseColor(m[0]);
      if (parsed !== null) out.push(parsed);
    }
  } catch {
    // Устойчивость: любой сбой парсинга сложного значения не роняет сбор.
    return out;
  }
  return out;
}

/**
 * Собирает палитру цветов корня `root`. Для каждого видимого элемента (в пределах
 * бюджета, кроме оверлея) снимает простые и строковые цветовые свойства,
 * нормализует и агрегирует. Полностью прозрачные токены (alpha=0) отбрасываются
 * как шум. `getStyle` инъектируется для тестов (по умолчанию `getComputedStyle`).
 */
export function collectPalette(
  root: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): PaletteScanData {
  const elements = walk(root, {
    budget: NODE_BUDGET,
    exclude: isOverlay,
    skipHidden: true,
    getStyle,
  });

  const hits: PaletteHit[] = [];
  for (const el of elements) {
    let style: CSSStyleDeclaration;
    try {
      style = getStyle(el);
    } catch {
      continue; // недоступный стиль — пропускаем элемент
    }
    const selector = describeElement(el);

    for (const property of SIMPLE_PROPS) {
      const parsed = parseColor(safeGetProperty(style, property));
      if (parsed !== null && parsed.a !== 0) hits.push({ rgba: parsed, selector, property });
    }

    for (const property of STRING_PROPS) {
      for (const rgba of extractColorsFromString(safeGetProperty(style, property))) {
        if (rgba.a !== 0) hits.push({ rgba, selector, property });
      }
    }
  }

  const entries = sortPalette(aggregatePalette(hits), 'frequency');
  return { entries, elements: elements.length };
}

/**
 * DOM-сборщик box-model выбранного элемента (TASK-018). Чистый модуль без
 * саморегистрации и без импортов из `@/content/**`: экспортирует id и функцию
 * `collectBoxModel`, которую content-хост (TASK-013) регистрирует через
 * `registerInspector` — проводку делает оркестратор.
 *
 * Снимает рамку (`getBoundingClientRect`) и толщины слоёв padding/border/margin из
 * вычисленного стиля (единый стиль с `contrast/collector.ts`: инъектируемый `getStyle`
 * для тестируемости). Размер контент-бокса выводится вычитанием padding и border из
 * рамки. Все результаты — plain-объекты (никаких DOM-узлов наружу), пригодны для
 * IIFE-бандла.
 */
import type { BoxModel, BoxSides, Rect } from './types';

/** Публичный id сборщика — под ним хост регистрирует его в реестре инспекторов. */
export const RULER_INSPECTOR_ID = 'ruler';

/** Дефолтный источник вычисленных стилей — глобальный `getComputedStyle`. */
const defaultGetStyle = (el: Element): CSSStyleDeclaration => getComputedStyle(el);

/** Парсит px-значение вычисленного стиля; на `auto`/NaN/пустом — 0. */
function px(style: CSSStyleDeclaration, prop: string): number {
  const raw = style.getPropertyValue(prop);
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
}

/** Снимает четыре стороны свойства по шаблону `<prop>-<side>` (напр. `padding-top`). */
function paddingLike(style: CSSStyleDeclaration, prop: 'padding' | 'margin'): BoxSides {
  return {
    top: px(style, `${prop}-top`),
    right: px(style, `${prop}-right`),
    bottom: px(style, `${prop}-bottom`),
    left: px(style, `${prop}-left`),
  };
}

/** Снимает толщины бордюра (`border-<side>-width`). */
function borderSides(style: CSSStyleDeclaration): BoxSides {
  return {
    top: px(style, 'border-top-width'),
    right: px(style, 'border-right-width'),
    bottom: px(style, 'border-bottom-width'),
    left: px(style, 'border-left-width'),
  };
}

/**
 * Собирает box-model элемента `el`. Рамка — из `getBoundingClientRect` (border-box);
 * слои padding/border/margin — из вычисленного стиля; контент-бокс — рамка минус
 * padding и border (не может быть отрицательным). `getStyle` инъектируется для тестов.
 */
export function collectBoxModel(
  el: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): BoxModel {
  const r = el.getBoundingClientRect();
  const rect: Rect = { x: r.x, y: r.y, width: r.width, height: r.height };

  const style = getStyle(el);
  const padding = paddingLike(style, 'padding');
  const border = borderSides(style);
  const margin = paddingLike(style, 'margin');

  const content = {
    width: Math.max(0, rect.width - padding.left - padding.right - border.left - border.right),
    height: Math.max(0, rect.height - padding.top - padding.bottom - border.top - border.bottom),
  };

  return { rect, content, padding, border, margin };
}

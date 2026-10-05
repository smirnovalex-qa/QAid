/**
 * DOM-сборщик детектора дефектов (TASK-024). Чистый модуль без саморегистрации и
 * без импортов из `@/content/**`: экспортирует id и функцию `collectDefects`,
 * которую content-хост (TASK-013) регистрирует через `registerInspector` — проводку
 * делает оркестратор.
 *
 * Обходит элементы поддерева с бюджетом (через общий `walk`), снимает сериализуемую
 * модель каждого узла (`DefectNode`): карту атрибутов, роль, упрощённое доступное имя,
 * уровень заголовка и — для `<img>` — факт нулевой ширины (битая загрузка). Оверлей
 * инспектора исключается. Наружу — только plain-объекты (никаких DOM-ссылок).
 */
import { walk } from '@/shared/inspection/dom';
import type { DefectNode, DefectScanData } from './types';

/** Публичный id сборщика — под ним хост регистрирует его в реестре инспекторов. */
export const DEFECTS_INSPECTOR_ID = 'defects';

/** Бюджет узлов обхода (PRD 9: до 10k без лага). */
const NODE_BUDGET = 10000;

/** Максимальная длина доступного имени/сниппета для отображения. */
const MAX_NAME_LEN = 120;

/** Тип текстового узла DOM (`Node.TEXT_NODE`). */
const TEXT_NODE = 3;

/** Дефолтный источник вычисленных стилей — глобальный `getComputedStyle`. */
const defaultGetStyle = (el: Element): CSSStyleDeclaration => getComputedStyle(el);

/** Короткий человекочитаемый селектор `tag#id.cls` (единый стиль слоя). */
function shortSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  const classes = Array.from(el.classList)
    .map((cls) => `.${cls}`)
    .join('');
  return tag + (id !== null && id !== '' ? `#${id}` : '') + classes;
}

/** Снимает карту атрибутов элемента (имя в нижнем регистре → значение). */
function readAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    out[a.name.toLowerCase()] = a.value;
  }
  return out;
}

/** Уровень заголовка 1..6 для `h1`..`h6`; иначе `null`. */
function headingLevelOf(tag: string): number | null {
  const m = /^h([1-6])$/.exec(tag);
  return m ? Number.parseInt(m[1] ?? '', 10) : null;
}

/** Собственный текст элемента (конкатенация прямых текст-узлов, схлопнутый). */
function ownText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === TEXT_NODE) out += node.textContent ?? '';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Весь видимый текст поддерева (для доступного имени по умолчанию), схлопнутый. */
function subtreeText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Текст элементов, на которые ссылается `aria-labelledby` (по id в документе). */
function labelledbyText(el: Element, ids: string): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  for (const id of ids.split(/\s+/)) {
    if (id === '') continue;
    const ref = doc.getElementById(id);
    if (ref !== null) parts.push(subtreeText(ref));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Обрезает длинную строку многоточием. */
function clip(text: string): string {
  return text.length > MAX_NAME_LEN ? `${text.slice(0, MAX_NAME_LEN)}…` : text;
}

/**
 * Упрощённое доступное имя: `aria-label` → `aria-labelledby` → `alt` (для `img`) →
 * `title` → `value` (для input-кнопок) → собственный/поддеревный текст. '' если ничего.
 */
function accessibleName(el: Element, tag: string, attrs: Record<string, string>): string {
  const ariaLabel = (attrs['aria-label'] ?? '').trim();
  if (ariaLabel !== '') return clip(ariaLabel);

  const labelledby = (attrs['aria-labelledby'] ?? '').trim();
  if (labelledby !== '') {
    const text = labelledbyText(el, labelledby);
    if (text !== '') return clip(text);
  }

  if (tag === 'img') {
    const alt = (attrs.alt ?? '').trim();
    if (alt !== '') return clip(alt);
  }

  const title = (attrs.title ?? '').trim();
  if (title !== '') return clip(title);

  if (tag === 'input') {
    const value = (attrs.value ?? '').trim();
    if (value !== '') return clip(value);
  }

  // Текст кнопки берём из всего поддерева (внутри может лежать <span>); для прочих —
  // собственный прямой текст, чтобы не приписывать контейнеру текст потомков.
  const text = tag === 'button' || attrs.role === 'button' ? subtreeText(el) : ownText(el);
  return text === '' ? '' : clip(text);
}

/** Факт нулевой ширины `<img>` (битая загрузка); `null` для не-`img`. */
function naturalWidthZeroOf(el: Element, tag: string): boolean | null {
  if (tag !== 'img') return null;
  const width = (el as HTMLImageElement).naturalWidth;
  return typeof width === 'number' ? width === 0 : null;
}

/**
 * Собирает модель узлов поддерева `root`. Второй аргумент — инъекция источника
 * стилей для тестируемости (используется `walk` для пропуска `display:none`); по
 * умолчанию глобальный `getComputedStyle`. Оверлей инспектора исключается.
 */
export function collectDefects(
  root: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): DefectScanData {
  const visitedEls = walk(root, {
    budget: NODE_BUDGET,
    exclude: (el) => el.hasAttribute('data-qatb-overlay'),
    getStyle,
  });

  const nodes: DefectNode[] = visitedEls.map((el, index) => {
    const tag = el.tagName.toLowerCase();
    const attrs = readAttrs(el);
    const roleRaw = (attrs.role ?? '').trim().toLowerCase();
    return {
      tag,
      attrs,
      role: roleRaw === '' ? null : roleRaw,
      accessibleNameHint: accessibleName(el, tag, attrs),
      headingLevel: headingLevelOf(tag),
      naturalWidthZero: naturalWidthZeroOf(el, tag),
      selector: shortSelector(el),
      index,
    };
  });

  return {
    nodes,
    visited: visitedEls.length,
    budget: NODE_BUDGET,
    truncated: visitedEls.length >= NODE_BUDGET,
  };
}

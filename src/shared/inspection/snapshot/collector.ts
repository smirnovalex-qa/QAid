/**
 * DOM-сборщик снимка страницы (TASK-028). Чистый модуль без саморегистрации и
 * без импортов из `@/content/**`: экспортирует id и функцию `collectSnapshot`,
 * которую content-хост (TASK-013) регистрирует через `registerInspector` —
 * проводку делает оркестратор.
 *
 * Обходит поддерево `root` с бюджетом (через общий `walk`), снимает по каждому
 * узлу сериализуемую модель (`SnapshotNode`): стабильный ключ идентичности,
 * структурный путь, курируемые атрибуты и вычисленные стили, собственный текст и
 * короткий селектор для подсветки. Источник стилей инъектируется (`getStyle`) для
 * тестируемости в jsdom. Оверлей инспектора исключается. Наружу — только
 * plain-объекты (никаких DOM-ссылок).
 */
import { walk } from '@/shared/inspection/dom';
import { CURATED_ATTRS, CURATED_STYLE_PROPS } from './types';
import type { Snapshot, SnapshotNode } from './types';

/** Публичный id сборщика — под ним хост регистрирует его в реестре инспекторов. */
export const SNAPSHOT_INSPECTOR_ID = 'snapshot';

/** Бюджет узлов обхода (PRD §9: до 10k без лага). */
const NODE_BUDGET = 10000;

/** Максимальная длина снимаемого собственного текста узла. */
const MAX_TEXT_LEN = 200;

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

/** Снимает курируемые атрибуты элемента (только присутствующие). */
function readCuratedAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of CURATED_ATTRS) {
    const value = el.getAttribute(name);
    if (value !== null) out[name] = value;
  }
  return out;
}

/** Снимает курируемые вычисленные стили элемента. */
function readCuratedStyles(style: CSSStyleDeclaration): Record<string, string> {
  const out: Record<string, string> = {};
  for (const prop of CURATED_STYLE_PROPS) {
    out[prop] = style.getPropertyValue(prop).trim();
  }
  return out;
}

/** Собственный прямой текст элемента (конкатенация текст-узлов, схлопнутый/обрезанный). */
function ownText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === TEXT_NODE) out += node.textContent ?? '';
  }
  const collapsed = out.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_TEXT_LEN ? `${collapsed.slice(0, MAX_TEXT_LEN)}…` : collapsed;
}

/**
 * Структурный путь по индексам детей от `root` до `el` (`/0/2/1`); корень — `/`.
 * Индекс — позиция среди element-детей родителя (устойчив к текстовым узлам).
 */
function pathOf(el: Element, root: Element): string {
  const parts: number[] = [];
  let node: Element = el;
  while (node !== root) {
    const parent = node.parentElement;
    if (parent === null) break;
    parts.unshift(Array.from(parent.children).indexOf(node));
    node = parent;
  }
  return `/${parts.join('/')}`;
}

/**
 * Базовый ключ идентичности узла: приоритет `data-testid` → `id` → структурный
 * путь. Testid/id дают стабильность к переупорядочиванию (идентичность определима);
 * путь — детерминированный fallback (при reorder меняется — это ожидаемо).
 */
function baseKeyOf(el: Element, path: string): string {
  const testid = el.getAttribute('data-testid');
  if (testid !== null && testid.trim() !== '') return `testid=${testid.trim()}`;
  const id = el.getAttribute('id');
  if (id !== null && id.trim() !== '') return `id=${id.trim()}`;
  return `path=${path}`;
}

/**
 * Собирает снимок поддерева `root`. Второй аргумент — инъекция источника стилей
 * для тестируемости (используется и `walk` для пропуска `display:none`); по
 * умолчанию глобальный `getComputedStyle`. Оверлей инспектора исключается.
 *
 * Ключи узлов уникализируются: при коллизии базового ключа (два одинаковых
 * `data-testid`/`id`) добавляется суффикс `~N` — иначе диф спутал бы разные узлы.
 */
export function collectSnapshot(
  root: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): Snapshot {
  const visitedEls = walk(root, {
    budget: NODE_BUDGET,
    exclude: (el) => el.hasAttribute('data-qatb-overlay'),
    getStyle,
  });

  const seen = new Map<string, number>();
  const nodes: SnapshotNode[] = visitedEls.map((el) => {
    const path = pathOf(el, root);
    const base = baseKeyOf(el, path);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const key = count === 0 ? base : `${base}~${String(count)}`;

    return {
      key,
      path,
      tag: el.tagName.toLowerCase(),
      selector: shortSelector(el),
      attrs: readCuratedAttrs(el),
      styles: readCuratedStyles(getStyle(el)),
      text: ownText(el),
    };
  });

  return {
    nodes,
    visited: visitedEls.length,
    budget: NODE_BUDGET,
    truncated: visitedEls.length >= NODE_BUDGET,
  };
}

/**
 * Чистая модель навигации по DOM-иерархии (TASK-052, ADR-0049).
 *
 * Слой `shared`: без `chrome.*`, без `preact` — только стандартные DOM-глобалы, как и
 * `dom.ts`. Функции детерминированы и jsdom-тестируемы; источник стилей инъектируется
 * (`getStyle`) ради тестов, по умолчанию — глобальный `getComputedStyle`.
 *
 * Инвариант границ сред (ADR-0049): наружу отдаются только сериализуемые снимки
 * (`NodeDescriptor`/`NavigationState`), сами `Element` через RPC не ходят. «Значимость»
 * узла — единый предикат `isInspectableElement` из `dom.ts` (тот же, что у обхода
 * `walk`), поэтому навигация пропускает ровно то же: собственный оверлей инспектора,
 * служебные теги и `display:none`.
 */
import { isInspectableElement } from './dom';
import type { NavigationState, NavigationStep, NodeDescriptor } from './types';

/** Источник вычисленных стилей (инъекция для тестов). */
type GetStyle = (el: Element) => CSSStyleDeclaration;

/** Дефолтный источник стилей — глобальный `getComputedStyle`. */
const defaultGetStyle: GetStyle = (el) => getComputedStyle(el);

/**
 * Бюджет длины breadcrumb-пути (PRD/ТЗ §5): глубокие деревья не раздувают ответ. При
 * переполнении путь усекается «с середины», сохраняя корень (голова) и хвост с текущим
 * узлом. Каждый дескриптор несёт настоящую `depth`, поэтому клик по предку остаётся
 * адресным даже после усечения (см. `ancestorAtDepth`).
 */
const MAX_PATH_LEN = 12;
/** Сколько корневых элементов пути сохраняется при усечении. */
const PATH_HEAD = 2;

/** Значимые (инспектируемые) прямые дети элемента — по единому предикату `dom.ts`. */
function significantChildren(el: Element, getStyle: GetStyle): Element[] {
  return Array.from(el.children).filter((c) => isInspectableElement(c, { getStyle }));
}

/**
 * Цепочка предков от корня документа к узлу включительно (`[html, …, el]`), только
 * элементы. Индекс в цепочке равен глубине узла — на этом стоит `ancestorAtDepth`.
 */
function ancestorChain(el: Element): Element[] {
  const chain: Element[] = [];
  let node: Element | null = el;
  while (node !== null) {
    chain.push(node);
    node = node.parentElement;
  }
  chain.reverse();
  return chain;
}

/** Ближайший значимый предок (пропускает служебный/скрытый), либо `null`. */
function significantParent(el: Element, getStyle: GetStyle): Element | null {
  let parent = el.parentElement;
  while (parent !== null && !isInspectableElement(parent, { getStyle })) {
    parent = parent.parentElement;
  }
  return parent;
}

/** Следующий значимый сосед в заданном направлении, либо `null`. */
function significantSibling(
  el: Element,
  dir: 'next' | 'previous',
  getStyle: GetStyle,
): Element | null {
  let node = dir === 'next' ? el.nextElementSibling : el.previousElementSibling;
  while (node !== null && !isInspectableElement(node, { getStyle })) {
    node = dir === 'next' ? node.nextElementSibling : node.previousElementSibling;
  }
  return node;
}

/** Короткий человекочитаемый селектор `tag#id.cls` (тот же стиль, что у слоя). */
function shortSelector(tagName: string, id: string | null, classNames: string[]): string {
  return (
    tagName +
    (id !== null && id !== '' ? `#${id}` : '') +
    classNames.map((cls) => `.${cls}`).join('')
  );
}

/**
 * Сериализуемый снимок узла с контекстом положения в дереве. Индекс/число соседей
 * считаются среди ЗНАЧИМЫХ соседей (по тому же предикату, что и шаги навигации), чтобы
 * индикатор позиции соответствовал тому, по чему реально ходят `←`/`→`.
 */
export function describeNode(el: Element, getStyle: GetStyle = defaultGetStyle): NodeDescriptor {
  const id = el.getAttribute('id');
  const classNames = Array.from(el.classList);
  const tagName = el.tagName.toLowerCase();
  const r = el.getBoundingClientRect();

  const parent = el.parentElement;
  const siblings = parent !== null ? significantChildren(parent, getStyle) : [el];
  const siblingIndex = siblings.indexOf(el);

  return {
    tagName,
    id,
    classNames,
    selector: shortSelector(tagName, id, classNames),
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    childElementCount: significantChildren(el, getStyle).length,
    siblingIndex,
    siblingCount: siblings.length,
    depth: ancestorChain(el).length - 1,
  };
}

/**
 * Breadcrumb-путь предков от корня документа к узлу включительно, каждый — снимок.
 * При превышении {@link MAX_PATH_LEN} путь усекается с середины: сохраняются первые
 * {@link PATH_HEAD} и хвост до бюджета (корень + путь к текущему узлу остаются видимы).
 */
export function buildPath(el: Element, getStyle: GetStyle = defaultGetStyle): NodeDescriptor[] {
  const chain = ancestorChain(el);
  const descriptors = chain.map((node) => describeNode(node, getStyle));
  if (descriptors.length <= MAX_PATH_LEN) return descriptors;
  const tailLen = MAX_PATH_LEN - PATH_HEAD;
  return [...descriptors.slice(0, PATH_HEAD), ...descriptors.slice(descriptors.length - tailLen)];
}

/**
 * Полное состояние навигации по узлу: снимок, breadcrumb и флаги доступности шагов.
 * `canAscend` — есть значимый родитель; `canDescend` — есть значимые дети.
 */
export function navigationState(
  el: Element,
  getStyle: GetStyle = defaultGetStyle,
): NavigationState {
  return {
    node: describeNode(el, getStyle),
    path: buildPath(el, getStyle),
    canAscend: significantParent(el, getStyle) !== null,
    canDescend: significantChildren(el, getStyle).length > 0,
  };
}

/**
 * Вычисляет целевой узел относительно текущего по шагу навигации. Возвращает `null`,
 * если шаг невозможен (нет родителя/детей/соседа или адрес предка вне пути) — вызывающий
 * трактует это как no-op (идемпотентно, без смены якоря). Не мутирует DOM.
 *
 * `ancestorAtDepth` использует `depth` как индекс в цепочке предков (корень = 0). Клик
 * по текущему узлу (его собственная глубина) возвращает его же — безопасный no-op.
 */
export function resolveStep(
  el: Element,
  step: NavigationStep,
  depth?: number,
  getStyle: GetStyle = defaultGetStyle,
): Element | null {
  switch (step) {
    case 'parent':
      return significantParent(el, getStyle);
    case 'firstChild': {
      const children = significantChildren(el, getStyle);
      return children[0] ?? null;
    }
    case 'nextSibling':
      return significantSibling(el, 'next', getStyle);
    case 'previousSibling':
      return significantSibling(el, 'previous', getStyle);
    case 'ancestorAtDepth': {
      if (depth === undefined || depth < 0 || !Number.isInteger(depth)) return null;
      const chain = ancestorChain(el);
      return chain[depth] ?? null;
    }
    default:
      return null;
  }
}

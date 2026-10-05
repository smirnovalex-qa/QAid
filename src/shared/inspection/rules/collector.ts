/**
 * Сборщик matched CSS rules / каскада выбранного узла (TASK-055) — чистый модуль
 * (канон `props`/`contrast`: без `@/content/**`/`preact`/`chrome.*`, источники
 * инъектируются для jsdom-тестов). Обходит CSSOM страницы (`document.styleSheets`),
 * собирает правила, чьи селекторы матчат узел, упорядочивает их по каскаду и
 * вычисляет атрибуцию «кто задал свойство». Результат — JSON-сериализуемый снимок;
 * `CSSRule`-объекты наружу НЕ отдаются (инвариант границ сред, ADR-0049).
 *
 * Почему CSSOM, а не CDP (`CSS.getMatchedStylesForNode`) — ADR-0052: least-privilege
 * (без права `debugger` и install-warning), работает при ОТКРЫТОМ DevTools, канон
 * слоя и тестируемость. Ограничения (cross-origin без CORS, UA-стили) честно
 * маркируются (`unreadableSheets`), а не замалчиваются.
 *
 * Матч определяет `element.matches(selectorText)` (источник истины), а не наш парсер
 * специфичности — он нужен лишь для упорядочивания внутри равных групп.
 */
import { PROP_CATALOG } from '@/shared/inspection/props/catalog';
import { compareSpecificity, computeSpecificity, splitSelectorList } from './specificity';
import type { Specificity } from './specificity';
import type {
  MatchedRule,
  MatchedRulesResult,
  PropDeclaration,
  PropertySource,
  RuleOrigin,
} from './types';

/**
 * Инъектируемые источники (по умолчанию — глобальные DOM-API). Вынесены ради
 * детерминированных jsdom-тестов с фейковыми таблицами стилей.
 */
export interface RulesDeps {
  /** Таблицы стилей документа (по умолчанию `document.styleSheets`). */
  readonly getStyleSheets: () => ArrayLike<CSSStyleSheet>;
  /** Применимо ли медиавыражение (по умолчанию `window.matchMedia`). */
  readonly mediaMatches: (query: string) => boolean;
  /** Поддерживается ли `@supports`-условие (по умолчанию `CSS.supports`). */
  readonly supports: (condition: string) => boolean;
}

/** Бюджет обхода: предел осмотренных style-правил (защита от аномально больших CSSOM). */
const RULE_BUDGET = 10_000;

/** Синтетический источник для author-правил из инлайнового `<style>` (без `href`). */
const INLINE_SHEET_SOURCE = '<style>';
/** Источник для правила, собранного из атрибута `style` узла. */
const INLINE_STYLE_SOURCE = '<inline>';

/** Плоский набор курируемых свойств (тот же источник правды, что у computed-профиля). */
const CATALOG_PROPERTIES: readonly string[] = PROP_CATALOG.flatMap((group) =>
  group.properties.map((p) => p.property),
);

function defaultDeps(): RulesDeps {
  return {
    getStyleSheets: () => document.styleSheets,
    mediaMatches: (query) => (typeof matchMedia === 'function' ? matchMedia(query).matches : true),
    supports: (condition) =>
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports(condition)
        : true,
  };
}

/** Одно собранное объявление (значение + важность). */
interface Decl {
  readonly value: string;
  readonly important: boolean;
}

/**
 * Промежуточное представление собранного правила до упорядочивания/атрибуции.
 * `order` — порядковый номер в источнике (document order), для детерминированного
 * тай-брейка каскада.
 */
interface RawRule {
  readonly selectorText: string;
  readonly specificity: Specificity;
  readonly origin: RuleOrigin;
  readonly source: string;
  readonly media: string | null;
  readonly layer: string | null;
  /** property → { value, important } в порядке каталога. */
  readonly decls: Map<string, Decl>;
  readonly order: number;
}

/** Контекст обхода grouping-правил: накопленные медиа/слой. */
interface GroupContext {
  readonly media: string | null;
  readonly layer: string | null;
}

/** Структурная «утиная» проекция `CSSRule` без жёстких типов (для feature-detection). */
interface RuleView {
  readonly selectorText?: unknown;
  readonly style?: CSSStyleDeclaration;
  readonly cssRules?: CSSRuleList;
  readonly media?: { readonly mediaText?: unknown };
  readonly conditionText?: unknown;
  readonly name?: unknown;
}

/** Собирает курируемые объявления из `style`-декларации правила (только из каталога). */
function readDeclarations(style: CSSStyleDeclaration): Map<string, Decl> {
  const decls = new Map<string, Decl>();
  for (const property of CATALOG_PROPERTIES) {
    const value = style.getPropertyValue(property).trim();
    if (value === '') continue;
    decls.set(property, { value, important: style.getPropertyPriority(property) === 'important' });
  }
  return decls;
}

/** Наилучшая специфичность среди частей списка селектора, что РЕАЛЬНО матчат узел. */
function matchedSpecificity(el: Element, selectorText: string): Specificity | null {
  let best: Specificity | null = null;
  for (const part of splitSelectorList(selectorText)) {
    let matches = false;
    try {
      matches = el.matches(part);
    } catch {
      continue; // невалидный/неподдерживаемый селектор — пропускаем, не роняя сбор
    }
    if (!matches) continue;
    const spec = computeSpecificity(part);
    if (best === null || compareSpecificity(spec, best) > 0) best = spec;
  }
  return best;
}

/** Состояние обхода (мутируемые счётчики), чтобы не тащить их через все аргументы. */
interface Walk {
  readonly el: Element;
  readonly deps: RulesDeps;
  readonly raw: RawRule[];
  /** Источник (href листа или `<style>`) для правил текущей обходимой таблицы. */
  source: string;
  examined: number;
  unreadableSheets: number;
  truncated: boolean;
  order: number;
}

/** Рекурсивно обходит список правил с учётом применимости grouping-контекста. */
function walkRules(rules: CSSRuleList, ctx: GroupContext, w: Walk): void {
  for (const rule of Array.from(rules)) {
    if (w.truncated) return;
    const view = rule as RuleView;

    if (typeof view.selectorText === 'string' && view.style !== undefined) {
      w.examined += 1;
      if (w.examined > RULE_BUDGET) {
        w.truncated = true;
        return;
      }
      const spec = matchedSpecificity(w.el, view.selectorText);
      if (spec === null) continue;
      const decls = readDeclarations(view.style);
      if (decls.size === 0) continue;
      w.raw.push({
        selectorText: view.selectorText,
        specificity: spec,
        origin: 'author',
        source: w.source,
        media: ctx.media,
        layer: ctx.layer,
        decls,
        order: w.order,
      });
      w.order += 1;
      continue;
    }

    const inner = view.cssRules;
    if (inner === undefined) continue; // @import/@font-face/@keyframes и прочее — пропускаем

    const next = groupContext(view, ctx, w.deps);
    if (next === null) continue; // медиа/supports не применимы — всю ветку пропускаем
    walkRules(inner, next, w);
  }
}

/**
 * Контекст для grouping-правила или `null`, если ветка неприменима к текущему
 * окружению (`@media` не матчит / `@supports` ложно). `@layer`-блок всегда
 * применим — лишь протаскивает имя слоя.
 */
function groupContext(view: RuleView, ctx: GroupContext, deps: RulesDeps): GroupContext | null {
  // @layer <name> { ... } — есть имя и нет условия/медиа.
  if (
    typeof view.name === 'string' &&
    view.media === undefined &&
    typeof view.conditionText !== 'string'
  ) {
    const layer = view.name === '' ? ctx.layer : joinContext(ctx.layer, view.name);
    return { media: ctx.media, layer };
  }

  // @media — есть MediaList.
  const mediaText = view.media?.mediaText;
  if (typeof mediaText === 'string') {
    if (mediaText !== '' && !safeMedia(deps, mediaText)) return null;
    return {
      media: mediaText === '' ? ctx.media : joinContext(ctx.media, `@media ${mediaText}`),
      layer: ctx.layer,
    };
  }

  // @supports — есть conditionText (и это не media).
  if (typeof view.conditionText === 'string') {
    if (!safeSupports(deps, view.conditionText)) return null;
    return ctx;
  }

  // Неизвестное grouping-правило (например @container) — применяем, не фильтруя.
  return ctx;
}

function joinContext(prev: string | null, next: string): string {
  return prev === null ? next : `${prev} · ${next}`;
}

function safeMedia(deps: RulesDeps, query: string): boolean {
  try {
    return deps.mediaMatches(query);
  } catch {
    return true; // не можем проверить — не отбрасываем ветку (ошибаемся в сторону показа)
  }
}

function safeSupports(deps: RulesDeps, condition: string): boolean {
  try {
    return deps.supports(condition);
  } catch {
    return true;
  }
}

/** Синтетическое inline-правило из атрибута `style` узла (только курируемые пары). */
function inlineRule(el: Element, order: number): RawRule | null {
  const style = (el as unknown as { style?: CSSStyleDeclaration }).style;
  if (style === undefined) return null;
  const decls = readDeclarations(style);
  if (decls.size === 0) return null;
  return {
    selectorText: 'element.style',
    specificity: [0, 0, 0], // вне шкалы селекторов; порядок даёт origin, не specificity
    origin: 'inline',
    source: INLINE_STYLE_SOURCE,
    media: null,
    layer: null,
    decls,
    order,
  };
}

/** Ключ приоритета объявления в каскаде (для выбора победителя). */
interface CascadeKey {
  readonly tier: number;
  readonly specificity: Specificity;
  readonly order: number;
}

/**
 * Приоритетный тир объявления:
 * important-inline(4) > important-author(3) > normal-inline(2) > normal-author(1).
 * `!important` инвертирует обычный порядок (author-important бьёт inline-normal).
 */
function tierOf(origin: RuleOrigin, important: boolean): number {
  if (important) return origin === 'inline' ? 4 : 3;
  return origin === 'inline' ? 2 : 1;
}

/**
 * Больше ли приоритет кандидата над текущим победителем.
 * Порядок каскада: тир → специфичность → порядок в источнике (позже — сильнее).
 */
function winsOver(cand: CascadeKey, best: CascadeKey): boolean {
  if (cand.tier !== best.tier) return cand.tier > best.tier;
  const bySpec = compareSpecificity(cand.specificity, best.specificity);
  if (bySpec !== 0) return bySpec > 0;
  return cand.order > best.order;
}

/** Порядок показа правил: убывание приоритета (origin → specificity → source-order). */
function byDisplayOrder(a: RawRule, b: RawRule): number {
  const oa = a.origin === 'inline' ? 1 : 0;
  const ob = b.origin === 'inline' ? 1 : 0;
  if (oa !== ob) return ob - oa; // inline выше
  const bySpec = compareSpecificity(b.specificity, a.specificity);
  if (bySpec !== 0) return bySpec; // специфичнее — выше
  return b.order - a.order; // позже в источнике — выше
}

/**
 * Снимает matched CSS rules узла. Чистая функция: читает только `styleSheets`/
 * `matches`/`style` узла, ничего не мутирует и не грузит по сети (`href` не
 * запрашивается — только как метаданные). Результат JSON-сериализуем.
 */
export function collectMatchedRules(
  el: Element,
  deps: RulesDeps = defaultDeps(),
): MatchedRulesResult {
  const w: Walk = {
    el,
    deps,
    raw: [],
    source: INLINE_SHEET_SOURCE,
    examined: 0,
    unreadableSheets: 0,
    truncated: false,
    order: 0,
  };

  const sheets = Array.from(deps.getStyleSheets());
  for (const sheet of sheets) {
    if (w.truncated) break;
    let rules: CSSRuleList | undefined;
    try {
      rules = (sheet as { cssRules?: CSSRuleList }).cssRules; // cross-origin без CORS → SecurityError
    } catch {
      w.unreadableSheets += 1;
      continue;
    }
    if (rules === undefined) continue;
    w.source = sheet.href ?? INLINE_SHEET_SOURCE;
    walkRules(rules, { media: null, layer: null }, w);
  }

  // Inline `style` узла — последним в source-order (origin всё равно главнее).
  const inline = inlineRule(el, w.order);
  w.order += 1;
  if (inline !== null) w.raw.push(inline);

  // Атрибуция: победитель на каждое свойство каталога (в порядке каталога — детерминизм).
  const winnerByProp = new Map<string, RawRule>();
  for (const property of CATALOG_PROPERTIES) {
    let best: RawRule | null = null;
    let bestKey: CascadeKey | null = null;
    for (const rule of w.raw) {
      const decl = rule.decls.get(property);
      if (decl === undefined) continue;
      const key: CascadeKey = {
        tier: tierOf(rule.origin, decl.important),
        specificity: rule.specificity,
        order: rule.order,
      };
      if (bestKey === null || winsOver(key, bestKey)) {
        best = rule;
        bestKey = key;
      }
    }
    if (best !== null) winnerByProp.set(property, best);
  }

  const ordered = [...w.raw].sort(byDisplayOrder);

  const rules: MatchedRule[] = ordered.map((raw) => {
    const declarations: PropDeclaration[] = [];
    for (const property of CATALOG_PROPERTIES) {
      const decl = raw.decls.get(property);
      if (decl === undefined) continue;
      declarations.push({
        property,
        value: decl.value,
        important: decl.important,
        winning: winnerByProp.get(property) === raw,
      });
    }
    return {
      selectorText: raw.selectorText,
      specificity: raw.specificity,
      origin: raw.origin,
      source: raw.source,
      media: raw.media,
      layer: raw.layer,
      declarations,
    };
  });

  const propertySources: Record<string, PropertySource> = {};
  for (const property of CATALOG_PROPERTIES) {
    const raw = winnerByProp.get(property);
    if (raw === undefined) continue;
    const decl = raw.decls.get(property);
    if (decl === undefined) continue;
    propertySources[property] = {
      selectorText: raw.selectorText,
      specificity: raw.specificity,
      important: decl.important,
      origin: raw.origin,
      source: raw.source,
    };
  }

  return {
    rules,
    propertySources,
    unreadableSheets: w.unreadableSheets,
    truncated: w.truncated,
  };
}

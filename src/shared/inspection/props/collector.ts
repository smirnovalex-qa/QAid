/**
 * Сборщик computed-профиля выбранного узла (TASK-054) — чистый модуль без
 * саморегистрации. Экспортирует id и `collectElementProps`, которую content-хост
 * (TASK-013) регистрирует через `registerInspector` — проводку делает оркестратор.
 *
 * Снимает КУРИРУЕМЫЙ (не сырой дамп ~350 полей) набор свойств из `catalog.ts`,
 * разбитый на смысловые группы, плюс вычисленные удобства для QA: эффективный фон и
 * контраст текст/фон (переиспользуя `effectiveBackground`/`parseColor`/`contrastRatio`
 * из `dom.ts` и порог «крупного текста» из contrast-логики — второй парсер/расчёт не
 * заводим), геометрию box (`getBoundingClientRect`). Идентичность + курируемый
 * allow-list атрибутов (без `value`/произвольного текста — приватность). Никаких
 * DOM-узлов наружу, мутаций DOM и сетевых вызовов: только чтение стилей/геометрии.
 * `getStyle` инъектируется для jsdom-тестов.
 */
import {
  blend,
  contrastRatio,
  effectiveBackground,
  parseColor,
  toRgba,
} from '@/shared/inspection/dom';
import type { Rgba } from '@/shared/inspection/dom';
import { isLargeText, roundRatio } from '@/shared/inspection/contrast/logic';
import { collectMatchedRules } from '@/shared/inspection/rules/collector';
import {
  ATTRIBUTE_ALLOWED_PREFIXES,
  ATTRIBUTE_ALLOWLIST,
  ATTRIBUTE_DENYLIST,
  FLEX_GRID_GROUP_ID,
  PROP_CATALOG,
  isFlexOrGrid,
  isNoiseValue,
} from './catalog';
import type {
  ContrastInfo,
  ElementGeometry,
  ElementIdentity,
  ElementProps,
  PropEntry,
  PropGroup,
} from './types';

export { PROP_INSPECTOR_ID } from './types';

/** Источник вычисленных стилей (инъектируется для тестов). */
type StyleReader = (el: Element) => CSSStyleDeclaration;
const defaultGetStyle: StyleReader = (el) => getComputedStyle(el);

/** Короткий человекочитаемый селектор `tag#id.cls` (единый стиль слоя). */
function shortSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  const classes = Array.from(el.classList)
    .map((cls) => `.${cls}`)
    .join('');
  return tag + (id !== null && id !== '' ? `#${id}` : '') + classes;
}

/** Снимок идентичности узла (снимок, не DOM-ссылка). */
function collectIdentity(el: Element): ElementIdentity {
  const id = el.getAttribute('id');
  return {
    tagName: el.tagName.toLowerCase(),
    id: id !== null && id !== '' ? id : null,
    classNames: Array.from(el.classList),
    selector: shortSelector(el),
  };
}

/** Округляет число до 2 знаков (геометрия — компактно и стабильно для сравнения). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Геометрия box из `getBoundingClientRect` (сериализуемый снимок, округлён). */
function collectGeometry(el: Element): ElementGeometry {
  const rect = el.getBoundingClientRect();
  return {
    x: round2(rect.x),
    y: round2(rect.y),
    width: round2(rect.width),
    height: round2(rect.height),
  };
}

/** Разрешён ли атрибут в снимок: allow-list/allow-prefix и НЕ в denylist. */
function isAllowedAttribute(name: string): boolean {
  const lower = name.toLowerCase();
  if (ATTRIBUTE_DENYLIST.has(lower)) return false;
  if (ATTRIBUTE_ALLOWLIST.includes(lower)) return true;
  return ATTRIBUTE_ALLOWED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Курируемый allow-list атрибутов узла. Порядок детерминирован: сначала имена в
 * порядке `ATTRIBUTE_ALLOWLIST`, затем остальные разрешённые (aria-* и data-testid)
 * по алфавиту. `value`/`style` и произвольный текст исключены (приватность).
 */
function collectAttributes(el: Element): Record<string, string> {
  const present = new Map<string, string>();
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (isAllowedAttribute(name)) present.set(name, attr.value);
  }

  const out: Record<string, string> = {};
  for (const name of ATTRIBUTE_ALLOWLIST) {
    const value = present.get(name);
    if (value !== undefined) {
      out[name] = value;
      present.delete(name);
    }
  }
  for (const name of Array.from(present.keys()).sort((a, b) => a.localeCompare(b))) {
    out[name] = present.get(name) ?? '';
  }
  return out;
}

/** Парсит вычисленный `font-weight` в число (нормализуя ключевые слова). */
function parseWeight(raw: string): number {
  if (raw === 'bold') return 700;
  if (raw === 'normal') return 400;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 400 : n;
}

/**
 * Приближённый ли фон под текстом: если на пути к первому непрозрачному фону
 * встречается `background-image` (градиент/картинка) — точная оценка невозможна.
 * Поднимается по предкам так же, как `effectiveBackground` компонует цвет.
 */
function backgroundIsApproximate(el: Element, getStyle: StyleReader): boolean {
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

/**
 * Вычисленное удобство контраста текст/фон. `null`, если у узла нет разбираемого
 * цвета текста. Переиспользует примитивы `dom.ts` и порог `isLargeText` — второй
 * расчёт не заводим (иначе разойдётся с contrast-инспектором).
 */
function collectContrastInfo(
  el: Element,
  style: CSSStyleDeclaration,
  getStyle: StyleReader,
): ContrastInfo | null {
  const fgRaw = parseColor(style.color);
  if (fgRaw === null) return null;

  const bg = effectiveBackground(el, getStyle);
  // Полупрозрачный текст композитим на фон — иначе контраст завышен.
  const fg: Rgba = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;

  const px = Number.parseFloat(style.fontSize);
  const size = Number.isNaN(px) ? 16 : px;
  const weight = parseWeight(style.fontWeight);

  return {
    foreground: toRgba(fg),
    background: toRgba(bg),
    ratio: roundRatio(contrastRatio(fg, bg)),
    large: isLargeText(size, weight),
    approximate: backgroundIsApproximate(el, getStyle),
  };
}

/**
 * Строит группы «свойство: значение» из каталога. Группа Flex/Grid попадает в
 * результат только при flex/grid-раскладке; пустые (после фильтра шума) группы
 * отбрасываются. Порядок групп и свойств — детерминирован (из каталога).
 */
function collectGroups(style: CSSStyleDeclaration): PropGroup[] {
  const display = style.getPropertyValue('display');
  const groups: PropGroup[] = [];

  for (const def of PROP_CATALOG) {
    if (def.id === FLEX_GRID_GROUP_ID && !isFlexOrGrid(display)) continue;

    const entries: PropEntry[] = [];
    for (const descriptor of def.properties) {
      const value = style.getPropertyValue(descriptor.property).trim();
      if (isNoiseValue(value)) continue;
      entries.push({ property: descriptor.property, value, kind: descriptor.kind });
    }
    if (entries.length > 0) groups.push({ id: def.id, entries });
  }

  return groups;
}

/**
 * Снимает computed-профиль одного узла. Второй аргумент — инъекция источника стилей
 * для тестируемости (по умолчанию глобальный `getComputedStyle`), как у
 * `effectiveBackground`. Результат JSON-сериализуем; DOM-узлы наружу не ходят.
 */
export function collectElementProps(
  el: Element,
  getStyle: StyleReader = defaultGetStyle,
): ElementProps {
  const style = getStyle(el);
  return {
    identity: collectIdentity(el),
    attributes: collectAttributes(el),
    geometry: collectGeometry(el),
    contrast: collectContrastInfo(el, style, getStyle),
    groups: collectGroups(style),
    // Matched CSS rules / каскад (TASK-055) — тем же `collect`-путём под id `'probe'`,
    // атрибуция по тому же `PROP_CATALOG`. Чистый обход CSSOM, без новых прав (ADR-0052).
    rules: collectMatchedRules(el),
  };
}

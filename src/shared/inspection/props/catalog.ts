/**
 * Единый курируемый каталог свойств «Инспектора элемента» (TASK-054) — источник
 * правды, а не хардкод по месту вызова. Определяет: какие computed-свойства
 * снимаются, в каких группах и в каком порядке (детерминированно — стабильный
 * вывод для сравнения и тестов), с какой разметкой (`PropKind`) их рисовать, какая
 * группа условна (Flex/Grid — только при соответствующем `display`), какие атрибуты
 * входят в allow-list (приватность) и по какому явному правилу значение считается
 * «шумным» и отбрасывается.
 *
 * Курируем, а не дампим: полный `getComputedStyle` (~350 полей) — шум, вес и
 * гигантские значения. Набор подобран под задачи QA (см. PRD 7.2).
 */
import type { PropKind } from './types';

/** Дескриптор одного свойства каталога. */
export interface PropDescriptor {
  /** Имя CSS-свойства (kebab-case, как в `getPropertyValue`). */
  readonly property: string;
  /** Разметка для отрисовки (свотч/формат). */
  readonly kind: PropKind;
}

/** Определение группы каталога: стабильный `id` (ключ i18n) + упорядоченные свойства. */
export interface PropGroupDef {
  /** Стабильный идентификатор группы — ключ заголовка i18n и порядка. */
  readonly id: string;
  /** Свойства группы в детерминированном порядке отображения. */
  readonly properties: readonly PropDescriptor[];
}

/** Id условной группы Flex/Grid — показывается только при flex/grid-раскладке. */
export const FLEX_GRID_GROUP_ID = 'flexGrid';

/**
 * Значения `display`, при которых узел — flex/grid-контейнер и группа Flex/Grid
 * осмысленна. Иначе группа не попадает в результат (не зашумляем).
 */
const FLEX_GRID_DISPLAYS: ReadonlySet<string> = new Set([
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
]);

/** Является ли значение `display` flex/grid-раскладкой (для условной группы). */
export function isFlexOrGrid(display: string): boolean {
  return FLEX_GRID_DISPLAYS.has(display.trim().toLowerCase());
}

/**
 * Курируемый каталог свойств по группам. Порядок групп и свойств — детерминирован
 * (важно для сравнения и тестов). Box-model — longhand: computed-shorthand
 * (`margin`/`padding`/`border`) в браузере часто пуст, значения потерялись бы.
 */
export const PROP_CATALOG: readonly PropGroupDef[] = [
  {
    id: 'typography',
    properties: [
      { property: 'font-family', kind: 'text' },
      { property: 'font-size', kind: 'length' },
      { property: 'font-weight', kind: 'text' },
      { property: 'font-style', kind: 'text' },
      { property: 'line-height', kind: 'length' },
      { property: 'letter-spacing', kind: 'length' },
      { property: 'text-align', kind: 'text' },
      { property: 'text-transform', kind: 'text' },
      { property: 'text-decoration', kind: 'text' },
      { property: 'white-space', kind: 'text' },
    ],
  },
  {
    id: 'color',
    properties: [
      { property: 'color', kind: 'color' },
      { property: 'background-color', kind: 'color' },
      { property: 'background-image', kind: 'text' },
      { property: 'opacity', kind: 'text' },
    ],
  },
  {
    id: 'boxModel',
    properties: [
      { property: 'width', kind: 'length' },
      { property: 'height', kind: 'length' },
      { property: 'padding-top', kind: 'length' },
      { property: 'padding-right', kind: 'length' },
      { property: 'padding-bottom', kind: 'length' },
      { property: 'padding-left', kind: 'length' },
      { property: 'margin-top', kind: 'length' },
      { property: 'margin-right', kind: 'length' },
      { property: 'margin-bottom', kind: 'length' },
      { property: 'margin-left', kind: 'length' },
      { property: 'border-top-width', kind: 'length' },
      { property: 'border-right-width', kind: 'length' },
      { property: 'border-bottom-width', kind: 'length' },
      { property: 'border-left-width', kind: 'length' },
      { property: 'box-sizing', kind: 'text' },
    ],
  },
  {
    id: 'borders',
    properties: [
      { property: 'border-style', kind: 'text' },
      { property: 'border-color', kind: 'color' },
      { property: 'border-radius', kind: 'length' },
      { property: 'outline', kind: 'text' },
      { property: 'box-shadow', kind: 'text' },
    ],
  },
  {
    id: 'layout',
    properties: [
      { property: 'display', kind: 'text' },
      { property: 'position', kind: 'text' },
      { property: 'top', kind: 'length' },
      { property: 'right', kind: 'length' },
      { property: 'bottom', kind: 'length' },
      { property: 'left', kind: 'length' },
      { property: 'z-index', kind: 'text' },
      { property: 'float', kind: 'text' },
      { property: 'overflow', kind: 'text' },
      { property: 'visibility', kind: 'text' },
    ],
  },
  {
    id: FLEX_GRID_GROUP_ID,
    properties: [
      { property: 'flex-direction', kind: 'text' },
      { property: 'flex-wrap', kind: 'text' },
      { property: 'justify-content', kind: 'text' },
      { property: 'align-items', kind: 'text' },
      { property: 'gap', kind: 'length' },
      { property: 'grid-template-columns', kind: 'text' },
      { property: 'grid-template-rows', kind: 'text' },
      { property: 'flex', kind: 'text' },
      { property: 'order', kind: 'text' },
    ],
  },
  {
    id: 'effects',
    properties: [
      { property: 'transform', kind: 'text' },
      { property: 'transition', kind: 'text' },
      { property: 'animation', kind: 'text' },
      { property: 'filter', kind: 'text' },
      { property: 'backdrop-filter', kind: 'text' },
      { property: 'cursor', kind: 'text' },
      { property: 'pointer-events', kind: 'text' },
    ],
  },
];

/**
 * Курируемый allow-list атрибутов — полезный QA и НЕ несущий PII/введённых данных.
 * `value` полей ввода и произвольный текстовый контент осознанно исключены
 * (инвариант приватности снимков, TASK-052 §8). `aria-*` и `data-testid`
 * добавляются сборщиком по префиксу отдельно (список ниже — точные имена).
 */
export const ATTRIBUTE_ALLOWLIST: readonly string[] = [
  'type',
  'name',
  'role',
  'disabled',
  'readonly',
  'checked',
  'required',
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'placeholder',
  'for',
  'lang',
  'dir',
  'tabindex',
  'contenteditable',
];

/** Префиксы атрибутов, разрешённые целиком (ARIA-состояния/роли, тестовые хуки). */
export const ATTRIBUTE_ALLOWED_PREFIXES: readonly string[] = ['aria-', 'data-testid'];

/**
 * Явно запрещённые атрибуты — перекрывают любой allow-prefix. `value` полей ввода
 * и `data-*` (кроме `data-testid`) могут нести введённые пользователем данные/PII.
 */
export const ATTRIBUTE_DENYLIST: ReadonlySet<string> = new Set(['value', 'style']);

/**
 * Явное правило «шумного» значения: пустая строка и дефолтные ключевые слова, не
 * несущие для QA информации. Отбрасываем детерминированно (а не «как получилось»),
 * чтобы не топить полезные свойства в `none`/`normal`/`auto`.
 */
const NOISE_VALUES: ReadonlySet<string> = new Set(['', 'none', 'normal', 'auto']);

/** Является ли вычисленное значение свойства «шумным» (подлежит отбрасыванию). */
export function isNoiseValue(value: string): boolean {
  return NOISE_VALUES.has(value.trim().toLowerCase());
}

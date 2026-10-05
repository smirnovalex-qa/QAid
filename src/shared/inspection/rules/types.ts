/**
 * Сериализуемая модель matched CSS rules / каскада выбранного узла + zod-схема
 * (TASK-055). Канон слоя (`props`/`contrast`): чистые типы + co-located схема +
 * мягкий парсер на UI-границе. Всё сериализуемо — снимок пересекает границу
 * content → side panel как `unknown`; `CSSRule`/`CSSStyleSheet`/`Element` наружу
 * НЕ ходят, только их плоские описания (селектор-строка, кортеж specificity, пары
 * свойство/значение).
 */
import { z } from 'zod';

/** Специфичность `(a, b, c)` — см. `specificity.ts`. */
export type Specificity = readonly [a: number, b: number, c: number];

/**
 * Источник правила в каскаде:
 *  - `inline` — атрибут `style` узла (бьёт любой author-селектор, кроме author-`!important`);
 *  - `author` — правило из таблицы стилей страницы (`<style>`/`<link>`).
 * UA-стили (стили браузера по умолчанию) в CSSOM недоступны и сюда не попадают
 * (известный разрыв с DevTools, ADR-0052).
 */
export type RuleOrigin = 'inline' | 'author';

/**
 * Одно объявление `property: value` внутри совпавшего правила. `winning` — победило
 * ли оно в каскаде для своего свойства (иначе в UI зачёркнуто, как в DevTools).
 */
export interface PropDeclaration {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
  readonly winning: boolean;
}

/**
 * Совпавшее с узлом CSS-правило — сериализуемый снимок. `selectorText` — полный
 * селектор правила (как показывает DevTools), `specificity` — специфичность той его
 * части, что реально матчит узел. `source` — `href` таблицы стилей или `<inline>`/
 * `<style>`. `media`/`layer` — каскадный контекст (`@media`/`@layer`), если есть.
 */
export interface MatchedRule {
  readonly selectorText: string;
  readonly specificity: Specificity;
  readonly origin: RuleOrigin;
  readonly source: string;
  readonly media: string | null;
  readonly layer: string | null;
  readonly declarations: readonly PropDeclaration[];
}

/**
 * Атрибуция «кто задал свойство»: для каждого свойства каталога — победившее в
 * каскаде правило (селектор/специфичность/важность/источник). Связывает
 * computed-значение из профиля с правилом, которое его задало.
 */
export interface PropertySource {
  readonly selectorText: string;
  readonly specificity: Specificity;
  readonly important: boolean;
  readonly origin: RuleOrigin;
  readonly source: string;
}

/**
 * Результат сбора matched rules узла:
 *  - `rules` — совпавшие правила в порядке убывания приоритета каскада (победитель выше);
 *  - `propertySources` — свойство → победившее правило (атрибуция);
 *  - `unreadableSheets` — сколько таблиц стилей не прочитано (cross-origin без CORS);
 *  - `truncated` — был ли превышен бюджет обхода (честный флаг «усечено»).
 */
export interface MatchedRulesResult {
  readonly rules: readonly MatchedRule[];
  readonly propertySources: Readonly<Record<string, PropertySource>>;
  readonly unreadableSheets: number;
  readonly truncated: boolean;
}

/** zod-схема кортежа специфичности (ровно три целых). */
const SpecificitySchema: z.ZodType<Specificity> = z.tuple([z.number(), z.number(), z.number()]);

/** zod-схема источника правила. */
const RuleOriginSchema: z.ZodType<RuleOrigin> = z.enum(['inline', 'author']);

/** zod-схема одного объявления. */
export const PropDeclarationSchema: z.ZodType<PropDeclaration> = z.object({
  property: z.string(),
  value: z.string(),
  important: z.boolean(),
  winning: z.boolean(),
});

/** zod-схема совпавшего правила. */
export const MatchedRuleSchema: z.ZodType<MatchedRule> = z.object({
  selectorText: z.string(),
  specificity: SpecificitySchema,
  origin: RuleOriginSchema,
  source: z.string(),
  media: z.string().nullable(),
  layer: z.string().nullable(),
  declarations: z.array(PropDeclarationSchema),
});

/** zod-схема атрибуции свойства. */
export const PropertySourceSchema: z.ZodType<PropertySource> = z.object({
  selectorText: z.string(),
  specificity: SpecificitySchema,
  important: z.boolean(),
  origin: RuleOriginSchema,
  source: z.string(),
});

/** zod-схема всего результата (валидируется в составе `ElementPropsSchema`). */
export const MatchedRulesSchema: z.ZodType<MatchedRulesResult> = z.object({
  rules: z.array(MatchedRuleSchema),
  propertySources: z.record(z.string(), PropertySourceSchema),
  unreadableSheets: z.number(),
  truncated: z.boolean(),
});

/**
 * Мягко валидирует произвольные данные как результат matched rules. `null` при
 * невалидном входе — вызывающая сторона тогда не обновляет данные (панель не падает).
 */
export function parseMatchedRules(data: unknown): MatchedRulesResult | null {
  const res = MatchedRulesSchema.safeParse(data);
  return res.success ? res.data : null;
}

/**
 * Сериализуемая модель computed-профиля выбранного узла + zod-схема (TASK-054).
 *
 * Живёт отдельным контрактом (по канону `fonts`/`contrast`/`palette`): чистый
 * сборщик (`collector.ts`), курируемый каталог (`catalog.ts`) и UI-панель фичи
 * `inspector-probe` опираются на единый набор типов, а не друг на друга. Всё
 * сериализуемо: снимок пересекает границу content → side panel как `unknown`,
 * DOM-узлы наружу не ходят — только их плоские описания. Валидация на UI-границе
 * (`parseElementProps`) в `parse` хука `useInspectedNode`.
 */
import { z } from 'zod';
import { MatchedRulesSchema } from '@/shared/inspection/rules/types';
import type { MatchedRulesResult } from '@/shared/inspection/rules/types';

/**
 * Id сборщика в реестре инспекторов content-хоста. Остаётся `'probe'` ради
 * обратной совместимости контракта `inspection/collect` (TASK-013): «Инспектор
 * элемента» — эталонный потребитель слоя, менять id нельзя.
 */
export const PROP_INSPECTOR_ID = 'probe';

/**
 * Разметка значения для отрисовки в панели:
 *  - `color`  — цветовое свойство (рисуем свотч рядом со значением);
 *  - `length` — размер/отступ/радиус (моноширинный формат);
 *  - `text`   — прочее ключевое слово/строка.
 */
export type PropKind = 'color' | 'length' | 'text';

/** Одна пара «свойство: значение» с разметкой отрисовки. */
export interface PropEntry {
  readonly property: string;
  readonly value: string;
  readonly kind: PropKind;
}

/**
 * Группа свойств (типографика, цвет, box-model и т.д.). `id` — стабильный ключ
 * группы из каталога (источник i18n-заголовка и порядка); пустые группы в
 * результат не попадают.
 */
export interface PropGroup {
  readonly id: string;
  readonly entries: readonly PropEntry[];
}

/** Идентичность узла — те же поля, что несёт дескриптор навигации (снимок, не DOM). */
export interface ElementIdentity {
  readonly tagName: string;
  readonly id: string | null;
  readonly classNames: readonly string[];
  readonly selector: string;
}

/** Геометрия box из `getBoundingClientRect` (сериализуемый снимок). */
export interface ElementGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Вычисленное «удобство» контраста текст/фон — переиспользует примитивы `dom.ts`
 * (`effectiveBackground`/`parseColor`/`contrastRatio`) и порог «крупного текста»
 * из contrast-логики. UI классифицирует `ratio` по WCAG (`threshold`), не пересчитывая.
 * `null`, если у узла нет разбираемого цвета текста (нечего мерить).
 */
export interface ContrastInfo {
  /** Цвет текста (`rgba(...)`, скомпонованный на фон, если был полупрозрачным). */
  readonly foreground: string;
  /** Эффективный фон (`rgba(...)`) — композиция alpha по предкам. */
  readonly background: string;
  /** Коэффициент контраста WCAG 2.1, округлён до 2 знаков. */
  readonly ratio: number;
  /** «Крупный» ли текст по WCAG (порог мягче) — из `isLargeText`. */
  readonly large: boolean;
  /** Приближённая ли оценка (под текстом градиент/картинка — точный фон неизвестен). */
  readonly approximate: boolean;
}

/**
 * Сериализуемый computed-профиль одного узла: идентичность + курируемый allow-list
 * атрибутов + геометрия + вычисленные удобства (контраст) + сгруппированные пары
 * «свойство: значение». Пересекает границу сред как `unknown`, валидируется схемой.
 */
export interface ElementProps {
  readonly identity: ElementIdentity;
  /** Курируемый allow-list атрибутов (без `value`/произвольного текста; приватность). */
  readonly attributes: Readonly<Record<string, string>>;
  readonly geometry: ElementGeometry;
  readonly contrast: ContrastInfo | null;
  readonly groups: readonly PropGroup[];
  /**
   * Matched CSS rules / каскад узла (TASK-055) — аддитивно. `null`, если сборщик
   * правил не отработал (обратная совместимость: старые снимки профиля без поля
   * валидны). Атрибуция считается по тому же `PROP_CATALOG`, что и `groups`, —
   * панель связывает computed-значение свойства с правилом, которое его задало.
   */
  readonly rules: MatchedRulesResult | null;
}

/** zod-схема разметки значения. */
const PropKindSchema: z.ZodType<PropKind> = z.enum(['color', 'length', 'text']);

/** zod-схема пары «свойство: значение». */
export const PropEntrySchema: z.ZodType<PropEntry> = z.object({
  property: z.string(),
  value: z.string(),
  kind: PropKindSchema,
});

/** zod-схема группы свойств. */
export const PropGroupSchema: z.ZodType<PropGroup> = z.object({
  id: z.string(),
  entries: z.array(PropEntrySchema),
});

/** zod-схема удобства контраста. */
export const ContrastInfoSchema: z.ZodType<ContrastInfo> = z.object({
  foreground: z.string(),
  background: z.string(),
  ratio: z.number(),
  large: z.boolean(),
  approximate: z.boolean(),
});

/**
 * zod-схема всего профиля (валидация ответа `inspection/collect` на UI-границе).
 * Без явной `z.ZodType<ElementProps>`-аннотации: `rules` использует `.default(null)`,
 * из-за чего ВХОДНОЙ тип поля опционален (старый снимок без `rules` валиден), а это
 * не совпадает с жёстким `ElementProps` на входе. Выходной тип схемы структурно
 * эквивалентен `ElementProps`, что и фиксирует `parseElementProps`.
 */
export const ElementPropsSchema = z.object({
  identity: z.object({
    tagName: z.string(),
    id: z.string().nullable(),
    classNames: z.array(z.string()),
    selector: z.string(),
  }),
  attributes: z.record(z.string(), z.string()),
  geometry: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  contrast: ContrastInfoSchema.nullable(),
  groups: z.array(PropGroupSchema),
  // Аддитивно и обратно совместимо: отсутствие поля в старом снимке → `null`
  // (`.default(null)`), битое значение — отвергается схемой целиком (панель не падает).
  rules: MatchedRulesSchema.nullable().default(null),
});

/**
 * Мягко валидирует произвольные данные как профиль узла (данные пересекли границу
 * сред как `unknown`). Возвращает профиль или `null` — при `null` `useInspectedNode`
 * не обновляет `data` (панель не роняется на частичном/битом входе).
 */
export function parseElementProps(data: unknown): ElementProps | null {
  const res = ElementPropsSchema.safeParse(data);
  return res.success ? res.data : null;
}

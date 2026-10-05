/**
 * Сериализуемая модель снимка страницы + zod-схема (TASK-028).
 *
 * Живёт отдельным контрактом, чтобы чистый diff-движок фичи (`logic.ts`),
 * DOM-сборщик (`collector.ts`), слой настроек и UI опирались на единый набор
 * типов, а не друг на друга. Всё сериализуемо (снимок пересекает границу
 * content → side panel как `unknown`): DOM-ссылки наружу не ходят — только их
 * плоские описания (`SnapshotNode`). Диф считается уже над этой моделью,
 * поэтому движок тестируется без браузера.
 */
import { z } from 'zod';

/**
 * Курируемый список вычисляемых CSS-свойств снимка — расширяемая константа
 * (ЗАМЕТКА для агента TASK-028: сравнивать осмысленный набор, а не весь
 * `getComputedStyle` — иначе перф и шум). Покрывает layout, box-model,
 * типографику и цвет — то, что чаще всего «плывёт» в регрессиях.
 */
export const CURATED_STYLE_PROPS = [
  'display',
  'position',
  'visibility',
  'opacity',
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'text-decoration',
  'width',
  'height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-radius',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'z-index',
  'overflow',
] as const;

/**
 * Курируемый список значимых атрибутов снимка — расширяемая константа. Шумные и
 * объёмные атрибуты (`style`, `srcset`, инлайновые обработчики) намеренно
 * исключены: диф атрибутов должен подсвечивать смысловые изменения (роль, ссылку,
 * состояние, тестовые хуки), а не косметику.
 */
export const CURATED_ATTRS = [
  'id',
  'class',
  'data-testid',
  'role',
  'href',
  'src',
  'alt',
  'title',
  'type',
  'name',
  'value',
  'placeholder',
  'for',
  'disabled',
  'checked',
  'selected',
  'hidden',
  'tabindex',
  'contenteditable',
  'aria-label',
  'aria-hidden',
  'aria-expanded',
  'aria-checked',
  'aria-disabled',
  'aria-selected',
] as const;

/**
 * Сериализуемый снимок одного элемента поддерева. Никаких DOM-ссылок: сборщик
 * заранее вычисляет всё, что нужно дифу.
 */
export interface SnapshotNode {
  /**
   * Стабильный ключ идентичности (см. `logic`/`collector`): приоритет
   * `data-testid` → `id` → структурный путь по индексам детей. Уникален в рамках
   * снимка (коллизии testid/id разрешаются суффиксом). По нему сопоставляются
   * узлы двух снимков — поэтому переупорядочивание не даёт ложной лавины там, где
   * идентичность определима.
   */
  readonly key: string;
  /** Структурный путь по индексам детей от корня (`/0/2/1`); корень — `/`. */
  readonly path: string;
  /** Имя тега в нижнем регистре. */
  readonly tag: string;
  /** Короткий CSS-селектор `tag#id.class` для подсветки узла на странице. */
  readonly selector: string;
  /** Карта курируемых атрибутов (имя → значение; пустые значения — как ''). */
  readonly attrs: Readonly<Record<string, string>>;
  /** Карта курируемых вычисленных стилей (свойство → значение). */
  readonly styles: Readonly<Record<string, string>>;
  /** Собственный прямой текст элемента (схлопнутый и ограниченный по длине). */
  readonly text: string;
}

/** Сериализуемый агрегат снимка страницы: узлы + метаданные обхода. */
export interface Snapshot {
  /** Снимки элементов в порядке обхода (pre-order). */
  readonly nodes: readonly SnapshotNode[];
  /** Сколько узлов посещено в пределах бюджета. */
  readonly visited: number;
  /** Бюджет узлов обхода. */
  readonly budget: number;
  /** Достигнут ли бюджет (снимок усечён). */
  readonly truncated: boolean;
}

/** zod-схема одного узла снимка (валидация на границе сред). */
export const SnapshotNodeSchema: z.ZodType<SnapshotNode> = z.object({
  key: z.string(),
  path: z.string(),
  tag: z.string(),
  selector: z.string(),
  attrs: z.record(z.string(), z.string()),
  styles: z.record(z.string(), z.string()),
  text: z.string(),
});

/** zod-схема агрегата снимка (валидация ответа `inspection/scan`). */
export const SnapshotSchema: z.ZodType<Snapshot> = z.object({
  nodes: z.array(SnapshotNodeSchema),
  visited: z.number(),
  budget: z.number(),
  truncated: z.boolean(),
});

/**
 * Мягко валидирует произвольные данные как снимок (данные пересекли границу сред
 * как `unknown`). Возвращает снимок или `null` — UI решает, что делать.
 */
export function parseSnapshot(data: unknown): Snapshot | null {
  const res = SnapshotSchema.safeParse(data);
  return res.success ? res.data : null;
}

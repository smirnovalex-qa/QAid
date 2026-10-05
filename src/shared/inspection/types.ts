/**
 * Общие типы инспекционного слоя (TASK-013). Живут в `shared`, т.к. пересекают
 * границу сред: поверхность (UI) шлёт запросы, content-скрипт возвращает
 * сериализуемые описания. DOM-узлы через границу не ходят — только их снимки.
 */

/** Прямоугольник элемента (сериализуемый снимок `getBoundingClientRect`). */
export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Сериализуемый снимок выбранного элемента. Возвращается пикером через границу
 * сред вместо самого DOM-узла (узел не клонируется наружу). Достаточен для
 * отображения в UI и как «якорь» последнего выбора для сборщиков.
 */
export interface PickedElement {
  /** Имя тега в нижнем регистре, напр. `div`, `button`. */
  tagName: string;
  /** Значение атрибута `id` или `null`. */
  id: string | null;
  /** Список классов (без пустых строк). */
  classNames: string[];
  /** Короткий человекочитаемый селектор для отображения, напр. `button#submit.primary`. */
  selector: string;
  /** Геометрия на момент выбора. */
  rect: ElementRect;
}

/**
 * Расширенный снимок узла для навигации по DOM-иерархии (TASK-052). Аддитивно
 * расширяет {@link PickedElement} контекстом положения узла в дереве, поэтому везде,
 * где ожидается `PickedElement`, `NodeDescriptor` подходит без изменений (обратная
 * совместимость `inspection/pick`). DOM-узел наружу по-прежнему не ходит — только снимок.
 */
export interface NodeDescriptor extends PickedElement {
  /** Число значимых (инспектируемых) дочерних элементов. */
  childElementCount: number;
  /** Индекс узла среди значимых соседей (0-based); `-1`, если узел не найден среди них. */
  siblingIndex: number;
  /** Число значимых соседей, включая сам узел. */
  siblingCount: number;
  /** Глубина от корня документа (`<html>` = 0). */
  depth: number;
}

/**
 * Шаг навигации по иерархии (TASK-052). `ancestorAtDepth` требует параметр `depth`
 * (адрес предка в breadcrumb-пути) — он передаётся отдельным полем запроса.
 */
export type NavigationStep =
  'parent' | 'firstChild' | 'nextSibling' | 'previousSibling' | 'ancestorAtDepth';

/**
 * Состояние навигации по текущему якорю (TASK-052): сам узел, breadcrumb-путь предков
 * от корня к узлу (включительно, возможно усечённый бюджетом) и флаги доступности
 * подъёма/спуска. Всё — сериализуемые снимки; DOM-узлы через границу сред не ходят.
 */
export interface NavigationState {
  /** Снимок текущего узла (якоря). */
  node: NodeDescriptor;
  /** Breadcrumb от корня документа к узлу (последний — сам узел). Может быть усечён. */
  path: NodeDescriptor[];
  /** Есть ли родитель (шаг `parent` возможен). */
  canAscend: boolean;
  /** Есть ли значимые дети (шаг `firstChild` возможен). */
  canDescend: boolean;
}

/** Идентификатор инспектора-сборщика (напр. `probe`, `contrast`, `palette`). */
export type InspectorId = string;

/**
 * Сборщик инспектора — функция от корневого элемента к сериализуемым данным.
 * Регистрируется в content-хосте (`registerInspector`) и запускается двумя путями:
 * `inspection/collect` (корень — выбранный пикером элемент, режим осмотра узла) и
 * `inspection/scan` (корень — `document.body`, страничный скан). Может быть
 * асинхронным (вернуть `Promise`) — хост дожидается результата перед ответом
 * (возвращаемый `unknown` покрывает и синхронное значение, и промис).
 */
export type InspectorCollector = (el: Element) => unknown;

/** Результат сборки: id инспектора + его сериализуемые данные. */
export interface CollectResult {
  inspectorId: InspectorId;
  data: unknown;
}

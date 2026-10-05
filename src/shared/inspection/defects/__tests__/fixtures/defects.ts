/**
 * Детерминированные фикстуры для тестов детектора дефектов (TASK-024).
 *
 * `makeNode` — фабрика сериализованной модели узла с разумными дефолтами: тесты
 * переопределяют только релевантные поля, не описывая весь `DefectNode` каждый раз.
 */
import type { DefectNode } from '../../types';

let autoIndex = 0;

/** Строит `DefectNode` с дефолтами; `index` автоинкрементится, если не задан. */
export function makeNode(over: Partial<DefectNode> = {}): DefectNode {
  const index = over.index ?? autoIndex++;
  return {
    tag: 'div',
    attrs: {},
    role: null,
    accessibleNameHint: '',
    headingLevel: null,
    naturalWidthZero: null,
    selector: `div:nth-child(${String(index)})`,
    index,
    ...over,
  };
}

/** Сбрасывает счётчик авто-индексов (вызывать в `beforeEach` для стабильности). */
export function resetNodeIndex(): void {
  autoIndex = 0;
}

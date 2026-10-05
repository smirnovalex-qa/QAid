/**
 * Публичный барель общего инспекционного UI (TASK-052): навигатор по DOM-иерархии
 * `HierarchyNav` + хук потока осмотра узла `useInspectedNode`. Импорт из одной точки:
 * `import { HierarchyNav, useInspectedNode } from '@/ui/inspection'`.
 *
 * Side-effect: домешивает общий каталог строк навигатора (RU/EN) при первом импорте —
 * контролы общие, поэтому и строки живут здесь, а не дублируются по фичам. `mergeCatalog`
 * идемпотентен.
 */
import { mergeCatalog } from '@/i18n';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

export { HierarchyNav } from './HierarchyNav';
export type { HierarchyNavProps } from './HierarchyNav';
export { BoxModelDiagram } from './BoxModelDiagram';
export type { BoxModelDiagramProps, BoxSidesInput } from './BoxModelDiagram';
export { useInspectedNode } from './useInspectedNode';
export type { UseInspectedNodeOptions, UseInspectedNodeResult } from './useInspectedNode';

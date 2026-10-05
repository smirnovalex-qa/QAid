/**
 * Русские строки общего навигатора по DOM-иерархии (TASK-052). Живут в UI-слое
 * (`src/ui/inspection`), а не в отдельной фиче: контролы `HierarchyNav`/`useInspectedNode`
 * общие для всех `inspector-*`, поэтому и каталог один — без дублирования по фичам.
 */
const ru: Record<string, string> = {
  // Общий поток осмотра узла (используется хуком `useInspectedNode`).
  'inspection.error.permissionDenied':
    'Доступ к страницам отклонён. Разрешите его, чтобы пользоваться инспектором на любой вкладке.',
  'inspection.error.noTab': 'Не удалось определить активную вкладку.',
  'inspection.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
  'inspection.error.cancelled': 'Выбор отменён.',

  // Навигатор по DOM-иерархии.
  'inspection.nav.breadcrumb': 'Путь по DOM',
  'inspection.nav.controls': 'Навигация по иерархии',
  'inspection.nav.parent': 'Родитель',
  'inspection.nav.child': 'Первый ребёнок',
  'inspection.nav.prevSibling': 'Предыдущий сосед',
  'inspection.nav.nextSibling': 'Следующий сосед',
  'inspection.nav.position': '{index} из {count}',
  'inspection.nav.goTo': 'Перейти к {selector}',
  'inspection.nav.current': 'текущий узел',
  'inspection.nav.truncated': 'часть пути скрыта',
  'inspection.nav.hint': '↑ родитель · ↓ ребёнок · ←/→ соседи · Esc — выход',
  // Шапка осматриваемого элемента.
  'inspection.node.size': '{width} × {height}',
  'inspection.node.sizeLabel': 'Отрисованный размер',
  'inspection.node.children': 'детей: {count}',
  'inspection.node.copySelector': 'Скопировать селектор',

  // Диаграмма box-model (общая для «Инспектора элемента» и линейки).
  'inspection.box.title': 'Box-model',
  'inspection.box.margin': 'margin',
  'inspection.box.border': 'border',
  'inspection.box.padding': 'padding',
  'inspection.box.content': 'content',
};

export default ru;

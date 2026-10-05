// Русские строки «Инспектора элемента» (computed-профиль, TASK-013 → TASK-054).
const ru: Record<string, string> = {
  'feature.inspectorProbe.title': 'Инспектор элемента',
  'feature.inspectorProbe.desc':
    'Выберите элемент на активной вкладке и смотрите его вычисленные свойства — типографику, цвет и контраст, box-model, раскладку — а также совпавшие CSS-правила и то, какое из них победило в каскаде; профиль пересчитывается при навигации по DOM-иерархии.',

  'inspection.instructions':
    'Нажмите «Осмотреть», затем ведите курсор по странице — элементы подсвечиваются под ним. Клик по элементу проваливает внутрь; кликайте дальше, чтобы углубляться. Esc — стоп.',
  'inspection.pick': 'Выбрать элемент',
  'inspection.cancel': 'Отмена',
  'inspection.result': 'Профиль элемента',
  'inspection.picked': 'Элемент выбран',

  // Живой режим инспекции курсором (TASK-056): кнопка выбора становится тумблером.
  'inspection.live.start': 'Осмотреть',
  'inspection.live.inspecting': 'Осматриваю…',
  'inspection.live.stop': 'Esc — стоп',
  'inspection.live.hint':
    'Кликайте по элементам, чтобы проваливаться внутрь · ↑ родитель · ←/→ соседи · Esc — выход',

  // Панель computed-профиля (TASK-054).
  'inspection.probe.attributes': 'Атрибуты',
  'inspection.probe.geometry': 'Box',
  'inspection.probe.contrast': 'Контраст текст/фон',
  'inspection.probe.approximate': 'приблизительно (градиент/картинка в фоне)',
  'inspection.probe.wcag.pass': 'проходит',
  'inspection.probe.wcag.fail': 'не проходит',
  'inspection.probe.filter': 'Фильтр',
  'inspection.probe.filter.placeholder': 'Фильтр по свойству или значению…',
  'inspection.probe.copyGroup': 'Копировать',
  'inspection.probe.noMatch': 'Нет свойств по фильтру.',

  // v3 «Осмотр страницы» — инспектор элемента.
  'inspection.probe.pick': 'Выбрать элемент',
  'inspection.probe.stop': 'Остановить выбор',
  'inspection.probe.pickHint':
    'Наведите на страницу для подсветки. Клик — выбрать, ещё клик — глубже.',
  'inspection.probe.intro': 'Выберите элемент, чтобы увидеть его отступы, стили и CSS-правила.',
  'inspection.probe.pickingStatus': 'выбор элемента',
  'inspection.probe.tab.props': 'Свойства',
  'inspection.probe.tab.rules': 'CSS-правила',

  // Matched CSS rules / каскад (TASK-055).
  'inspection.probe.rules.title': 'Правила / Каскад',
  'inspection.probe.rules.empty': 'Нет авторских CSS-правил, совпавших с этим элементом.',
  'inspection.probe.rules.inline': 'стиль элемента',
  'inspection.probe.rules.inlineSource': 'инлайн',
  'inspection.probe.rules.styleSheet': 'таблица стилей',
  'inspection.probe.rules.specificity': 'Специфичность {a},{b},{c}',
  'inspection.probe.rules.setBy': 'задано правилом {selector}',
  'inspection.probe.rules.cors':
    'Недоступно внешних таблиц стилей: {count} (cross-origin / CORS); их правила не показаны.',
  'inspection.probe.rules.truncated': 'На странице слишком много CSS-правил — список усечён.',

  // Заголовки групп свойств (id совпадают с курируемым каталогом).
  'inspection.probe.group.typography': 'Типографика',
  'inspection.probe.group.color': 'Цвет и фон',
  'inspection.probe.group.boxModel': 'Box-model',
  'inspection.probe.group.borders': 'Границы и контур',
  'inspection.probe.group.layout': 'Раскладка и позиционирование',
  'inspection.probe.group.flexGrid': 'Flex / Grid',
  'inspection.probe.group.effects': 'Эффекты и взаимодействие',

  'inspection.error.permissionDenied':
    'Доступ к страницам отклонён. Разрешите его, чтобы пользоваться инспектором на любой вкладке.',
  'inspection.error.noTab': 'Не удалось определить активную вкладку.',
  'inspection.error.privilegedPage':
    'На этой странице инспектор недоступен (служебная страница браузера или магазин расширений).',
  'inspection.error.permission':
    'Нет доступа к этой странице. Нажмите «Выбрать элемент» ещё раз и разрешите доступ в диалоге.',
  'inspection.error.injectionFailed': 'Не удалось внедрить инспектор в страницу.',
  'inspection.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

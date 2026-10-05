// Русские строки фичи «Детектор дефектов» (TASK-024).
const ru: Record<string, string> = {
  'feature.defects.title': 'Детектор дефектов',
  'feature.defects.desc':
    'Сканирует активную вкладку на типовые дефекты вёрстки, доступности и тестируемости: картинки без alt, битые картинки, ссылки-заглушки, пустые/дублирующиеся data-testid, дубли id, кнопки без имени и нарушения порядка заголовков. Клик по строке подсвечивает узел на странице.',

  'defects.instructions':
    'Нажмите «Сканировать страницу», чтобы прогнать все включённые детекторы по активной вкладке. Переключайте правила ниже — результат обновляется мгновенно, без повторного скана.',
  'defects.scan': 'Сканировать страницу',
  'defects.rescan': 'Пересканировать',
  'defects.cancel': 'Отмена',

  'defects.rules': 'Что проверять',

  // v3 «Осмотр страницы» — общее пустое состояние скана + мета-бар.
  'scan.scanThis': 'Сканировать страницу',
  'scan.scanning': 'Сканирую…',
  'scan.permNote': 'При первом скане браузер попросит доступ к сайту. Страница не изменяется.',
  'scan.again': 'Пересканировать',
  'scan.meta.defects': '{count} проблем',

  'defects.scanIntro':
    'Найдёт частые проблемы: картинки без alt, битые картинки, пустые ссылки и кнопки, поля без подписей.',
  'defects.filter.error': 'Ошибки',
  'defects.filter.warning': 'Предупреждения',
  'defects.filter.info': 'Советы',
  'defects.show': 'Показать',
  'defects.rulesSummary': '{on} из {total} вкл',
  'defects.noneForFilter': 'Нет проблем под выбранные уровни.',

  'defects.summary': 'Ошибок {errors}, предупреждений {warnings}, замечаний {infos}',
  'defects.total': 'дефектов: {total}',
  'defects.truncated': 'Показано {visited} из бюджета {budget} узлов',
  'defects.clean': 'Дефектов на странице не найдено.',
  'defects.noResults': 'Под включённые правила дефектов нет.',
  'defects.list': 'Найденные дефекты',
  'defects.highlightHint': 'Подсветить на странице',
  'defects.notFound': 'Узел уже отсутствует на странице.',

  'defects.severity.error': 'Ошибка',
  'defects.severity.warning': 'Предупреждение',
  'defects.severity.info': 'Замечание',

  'defects.export': 'Экспорт',
  'defects.export.plain': 'Текст',
  'defects.export.json': 'JSON',
  'defects.export.csv': 'CSV',

  'defect.rule.imgAlt': 'Изображение без alt',
  'defect.rule.imgBroken': 'Битое изображение (не загрузилось)',
  'defect.rule.buttonNoName': 'Кнопка без доступного имени',
  'defect.rule.idDuplicate': 'Дубль id',
  'defect.rule.testidEmpty': 'Пустой data-testid',
  'defect.rule.testidDuplicate': 'Дубль data-testid',
  'defect.rule.linkNoHref': 'Ссылка без href',
  'defect.rule.linkJsVoid': 'Ссылка с href="javascript:"',
  'defect.rule.linkHash': 'Ссылка-заглушка (href="#")',
  'defect.rule.headingOrder': 'Нарушение порядка заголовков',

  'defects.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы сканировать вкладки.',
  'defects.error.noTab': 'Не удалось определить активную вкладку.',
  'defects.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

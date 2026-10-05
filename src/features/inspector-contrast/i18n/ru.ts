// Русские строки фичи «Инспектор: контраст WCAG» (TASK-014).
const ru: Record<string, string> = {
  'feature.contrast.title': 'Контраст WCAG',
  'feature.contrast.desc':
    'Сканирует активную вкладку на пары текст/фон, не проходящие контраст WCAG 2.1 (AA/AAA). Клик по строке подсвечивает узел на странице.',

  'contrast.instructions':
    'Нажмите «Сканировать страницу», чтобы измерить контраст текста на активной вкладке. Фильтрация мгновенная — без повторного скана.',
  'contrast.scan': 'Сканировать страницу',
  'contrast.rescan': 'Пересканировать',
  'contrast.cancel': 'Отмена',

  'contrast.mode': 'Область',
  'contrast.mode.page': 'Вся страница',
  'contrast.mode.element': 'Осмотреть элемент',
  'contrast.inspect': 'Осмотреть элемент',
  'contrast.reinspect': 'Выбрать другой',

  'contrast.level': 'Уровень',
  'contrast.level.aa': 'AA',
  'contrast.level.aaa': 'AAA',
  'contrast.textType': 'Текст',
  'contrast.textType.all': 'Любой',
  'contrast.textType.normal': 'Обычный',
  'contrast.textType.large': 'Крупный',
  'contrast.onlyFails': 'Только провалы',

  // v3 «Осмотр страницы» — общее пустое состояние скана + мета-бар.
  'scan.scanThis': 'Сканировать страницу',
  'scan.scanning': 'Сканирую…',
  'scan.permNote': 'При первом скане браузер попросит доступ к сайту. Страница не изменяется.',
  'scan.again': 'Пересканировать',
  'scan.meta.contrast': '{count} текстовых элементов',

  'contrast.scanIntro': 'Проверит весь видимый текст по WCAG 2.1 и покажет, что плохо читается.',
  'contrast.onlyFail': 'Только проблемы',
  'contrast.tile.fail': 'не проходят',
  'contrast.tile.pass': 'проходят',
  'contrast.tile.approx': 'на картинках',
  'contrast.badge.pass': 'Проходит',
  'contrast.badge.fail': 'Не проходит',
  'contrast.badge.approx': 'Примерно',

  'contrast.summary': 'Прошло {pass}, провалено {fail} из {total}',
  'contrast.truncated': 'Показано {visited} из бюджета {budget} узлов',
  'contrast.empty': 'Результатов пока нет — запустите скан.',
  'contrast.noResults': 'Под текущий фильтр ничего не подходит.',
  'contrast.results': 'Нарушения контраста',
  'contrast.list': 'Результаты контраста',

  'contrast.ratio': 'Коэффициент',
  'contrast.required': 'Требуется',
  'contrast.large': 'крупный',
  'contrast.approximate': 'Прибл.',
  'contrast.pass': 'Прошло',
  'contrast.fail': 'Провал',
  'contrast.fg': 'Цвет текста',
  'contrast.bg': 'Цвет фона',
  'contrast.highlightHint': 'Подсветить на странице',

  'contrast.export': 'Экспорт',
  'contrast.export.plain': 'Текст',
  'contrast.export.json': 'JSON',
  'contrast.export.csv': 'CSV',
  'contrast.notFound': 'Узел уже отсутствует на странице.',

  'contrast.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы сканировать вкладки.',
  'contrast.error.noTab': 'Не удалось определить активную вкладку.',
  'contrast.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

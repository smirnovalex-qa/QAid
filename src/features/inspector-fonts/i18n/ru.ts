// Русские строки фичи «Инспектор: шрифты» (TASK-016).
const ru: Record<string, string> = {
  'feature.fonts.title': 'Инспектор шрифтов',
  'feature.fonts.desc':
    'Соберите используемые на активной вкладке шрифты: семейства, размеры, начертания и источник (веб-шрифт или системный). Осмотрите отдельный элемент пикером.',

  'fonts.scan': 'Сканировать страницу',
  'fonts.inspect': 'Осмотреть элемент',
  'fonts.cancel': 'Отмена',
  'fonts.instructions':
    'Нажмите «Сканировать страницу», чтобы собрать все шрифты, или «Осмотреть элемент», чтобы выбрать конкретный узел. Esc — отмена выбора.',
  'fonts.picked': 'Шрифты собраны',

  'fonts.sort': 'Сортировка',
  'fonts.sort.count': 'По частоте',
  'fonts.sort.name': 'По имени',

  'fonts.source.web': 'веб-шрифт',
  'fonts.source.local': 'системный',
  'fonts.source.unknown': 'неизвестно',

  // v3 «Осмотр страницы» — общее пустое состояние скана + мета-бар.
  'scan.scanThis': 'Сканировать страницу',
  'scan.scanning': 'Сканирую…',
  'scan.permNote': 'При первом скане браузер попросит доступ к сайту. Страница не изменяется.',
  'scan.again': 'Пересканировать',
  'scan.meta.fonts': '{count} семейства шрифтов',

  'fonts.scanIntro': 'Покажет, какие шрифты реально используются и откуда загружены.',
  'fonts.badge.web': 'Веб-шрифт',
  'fonts.badge.local': 'Системный',
  'fonts.badge.unknown': 'Неизвестно',
  'fonts.sampleText': 'Съешь же ещё этих мягких булок — Quick fox',
  'fonts.fontNote': 'Образцы — на шрифтах вашего компьютера. Расширение не скачивает шрифты.',

  'fonts.count': 'использований: {count}',
  'fonts.families': 'Семейства',
  'fonts.empty': 'Шрифты пока не собраны.',
  'fonts.noText': 'На странице не найдено текстовых элементов.',
  'fonts.apiUnavailable':
    'API document.fonts недоступен — источник шрифтов определить нельзя (показано «неизвестно»).',

  'fonts.sizes': 'Размеры',
  'fonts.weights': 'Начертания (вес)',
  'fonts.styles': 'Стили',
  'fonts.usedIn': 'Где используется',
  'fonts.highlight': 'Подсветить на странице',
  'fonts.notFound': 'Элемент не найден на странице.',

  'fonts.profile': 'Профиль элемента',
  'fonts.profile.applied': 'Применённое семейство',
  'fonts.profile.chain': 'Цепочка font-family',
  'fonts.profile.size': 'Размер',
  'fonts.profile.weight': 'Вес',
  'fonts.profile.style': 'Стиль',
  'fonts.profile.lineHeight': 'Межстрочный',
  'fonts.profile.letterSpacing': 'Трекинг',
  'fonts.preview': 'Образец',
  'fonts.previewText': 'Съешь ещё этих мягких французских булок 0123',

  'fonts.face.url': 'URL',
  'fonts.face.format': 'Формат',
  'fonts.face.urlUnavailable': 'недоступно',

  'fonts.export.format': 'Формат экспорта',
  'fonts.export.plain': 'Текст',
  'fonts.export.json': 'JSON',
  'fonts.export.csv': 'CSV',
  'fonts.export.copy': 'Копировать отчёт',

  'fonts.error.permissionDenied':
    'Доступ к страницам отклонён. Разрешите его, чтобы пользоваться инспектором на любой вкладке.',
  'fonts.error.noTab': 'Не удалось определить активную вкладку.',
  'fonts.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

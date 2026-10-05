// Русские строки фичи «Инспектор: палитра цветов» (TASK-015).
const ru: Record<string, string> = {
  'feature.palette.title': 'Палитра цветов',
  'feature.palette.desc':
    'Соберите все используемые на странице цвета (текст, фон, границы, тени, SVG), с частотой и списком «где используется». Копирование в HEX/RGB/HSL, экспорт.',

  'palette.scan': 'Сканировать страницу',
  'palette.scanning': 'Сканирование…',
  'palette.cancel': 'Отмена',
  'palette.eyedropper': 'Пипетка',
  'palette.instructions':
    'Нажмите «Сканировать страницу», чтобы собрать палитру активной вкладки. «Пипетка» — выбрать цвета одного элемента.',

  // v3 «Осмотр страницы» — общее пустое состояние скана + мета-бар.
  'scan.scanThis': 'Сканировать страницу',
  'scan.scanning': 'Сканирую…',
  'scan.permNote': 'При первом скане браузер попросит доступ к сайту. Страница не изменяется.',
  'scan.again': 'Пересканировать',
  'scan.meta.palette': '{count} цветов',

  'palette.scanIntro': 'Соберёт все цвета страницы — текст, фоны, рамки, тени, иконки.',
  'palette.palHint': 'Нажмите на цвет, чтобы скопировать.',
  'palette.pickFromPage': 'Пипетка',
  'palette.highlight': 'Подсветить на странице',

  'palette.format': 'Формат',
  'palette.format.hex': 'HEX',
  'palette.format.rgb': 'RGB',
  'palette.format.hsl': 'HSL',

  'palette.sort': 'Сортировка',
  'palette.sort.frequency': 'По частоте',
  'palette.sort.hue': 'По оттенку',
  'palette.sort.lightness': 'По светлоте',

  'palette.export': 'Экспорт',
  'palette.export.plain': 'Текст',
  'palette.export.json': 'JSON',
  'palette.export.csv': 'CSV',
  'palette.export.output': 'Экспорт палитры',

  'palette.empty': 'Палитра пуста — запустите сканирование.',
  'palette.summary': 'Цветов: {colors} · Элементов: {elements}',
  'palette.count': 'Встречается: {count}',
  'palette.whereUsed': 'Где используется',
  'palette.whereUsed.show': 'Показать использование',
  'palette.whereUsed.hide': 'Скрыть использование',
  'palette.usage.more': 'и ещё {count}',
  'palette.swatch.aria': 'Цвет {value}, встречается {count} раз. Нажмите, чтобы скопировать.',
  'palette.picked': 'Цвет выбран пипеткой',

  'palette.error.permissionDenied':
    'Доступ к страницам отклонён. Разрешите его, чтобы собирать палитру на любой вкладке.',
  'palette.error.noTab': 'Не удалось определить активную вкладку.',
  'palette.error.eyedropper': 'Не удалось получить цвет пипеткой.',
  'palette.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

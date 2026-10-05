// Русские строки фичи «Скриншот с аннотациями» (TASK-027).
const ru: Record<string, string> = {
  'feature.screenshot.title': 'Скриншот',
  'feature.screenshot.desc':
    'Снимок видимой области, выбранного элемента или всей страницы с аннотациями (рамка, стрелка, линия, текст, замазка). Экспорт в PNG — копирование или скачивание, всё локально.',

  'screenshot.capture': 'Снять',
  'screenshot.cancel': 'Отмена',
  'screenshot.options': 'Ещё опции',
  'screenshot.retake': 'Новый скриншот',
  'screenshot.idleNote': 'Скриншоты остаются на вашем компьютере.',

  // Редактор прямо на странице («заморозка экрана», TASK-035).
  'screenshot.inPage': 'Редактировать на странице',
  'screenshot.inPage.hint':
    'Заморозить вьюпорт активной вкладки и выделять/аннотировать прямо на странице (только видимая область).',
  'screenshot.inPage.fullFallback':
    'Полную страницу нельзя заморозить мгновенно — открываю редактор в side panel.',
  'screenshot.inPage.blockedFallback':
    'На этой странице in-page редактор недоступен (служебная/заблокированная страница) — открыт в side panel.',
  'screenshot.inPage.close': 'Закрыть',
  'screenshot.inPage.thicker': 'Толще',
  'screenshot.inPage.thinner': 'Тоньше',
  'screenshot.inPage.toolbar': 'Инструменты скриншота',
  'screenshot.inPage.hintSelect': 'Потяните, чтобы выделить область · Esc — отмена',

  'screenshot.mode': 'Режим захвата',
  'screenshot.mode.visible': 'Видимая область',
  'screenshot.mode.element': 'Один элемент',
  'screenshot.mode.full': 'Вся страница',
  'screenshot.mode.visible.help': 'То, что сейчас на экране',
  'screenshot.mode.element.help': 'Кликните элемент на странице',
  'screenshot.mode.full.help': 'Прокрутит и склеит целиком',

  'screenshot.hint.visible': 'Снимок текущей видимой области вкладки.',
  'screenshot.hint.element':
    'Выберите элемент на странице — будет снята его область (должен быть во вьюпорте).',
  'screenshot.hint.full':
    'Склейка прокруткой — best-effort: sticky/fixed-элементы и ленивый контент могут задваиваться или смещаться. Не пиксель-перфект.',

  'screenshot.tools': 'Инструменты аннотаций',
  'screenshot.tool.rectangle': 'Рамка',
  'screenshot.tool.arrow': 'Стрелка',
  'screenshot.tool.freehand': 'Линия',
  'screenshot.tool.text': 'Текст',
  'screenshot.tool.blur': 'Замазка',

  'screenshot.color': 'Цвет',
  'screenshot.colorCustom': 'Выбрать другой цвет',
  'screenshot.color.red': 'Красный',
  'screenshot.color.yellow': 'Жёлтый',
  'screenshot.color.blue': 'Синий',
  'screenshot.color.black': 'Чёрный',
  'screenshot.thickness': 'Толщина',
  'screenshot.width.thin': 'Тонкая',
  'screenshot.width.medium': 'Средняя',
  'screenshot.width.thick': 'Толстая',
  'screenshot.blurHint': 'Замазка впечатывается в картинку — её нельзя убрать из файла.',
  'screenshot.drawHint': 'Кликните по картинке, чтобы добавить пометку.',

  'screenshot.textLabel': 'Подпись',
  'screenshot.textPlaceholder': 'Текст подписи…',
  'screenshot.textHint':
    'Кликните по снимку, где поставить подпись, и введите текст (Enter — зафиксировать, Esc — отмена).',

  'screenshot.canvasLabel': 'Холст скриншота — рисуйте аннотации мышью',
  'screenshot.undo': 'Отменить',
  'screenshot.redo': 'Вернуть',
  'screenshot.clear': 'Очистить',

  'screenshot.copy': 'Копировать',
  'screenshot.download': 'Скачать PNG',
  'screenshot.copied': 'PNG скопирован в буфер',
  'screenshot.downloaded': 'Файл скачан',

  'screenshot.error.capture': 'Не удалось сделать снимок. Попробуйте ещё раз.',
  'screenshot.error.permissionDenied': 'Доступ к странице отклонён. Выдайте его для захвата.',
  'screenshot.error.noTab': 'Не удалось определить активную вкладку (служебная страница?).',
  'screenshot.error.cancelled': 'Выбор отменён.',
  'screenshot.error.export': 'Не удалось подготовить изображение к экспорту.',
  'screenshot.error.copy': 'Не удалось скопировать изображение в буфер.',
};

export default ru;

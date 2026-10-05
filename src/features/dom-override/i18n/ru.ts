// Русские строки фичи «Мок: DOM-подмена выделением» (TASK-023).
const ru: Record<string, string> = {
  'feature.domOverride.title': 'DOM-подмена выделением',
  'feature.domOverride.desc':
    'Косметически подменяет содержимое выбранного элемента: текст, атрибут, скрытие или длинный плейсхолдер. Подмены переигрываются при изменениях страницы. Это НЕ сетевой мок — меняется только DOM, без запросов.',

  // Плашка «косметика, не сеть».
  'domOverride.cosmeticNote': 'Косметическая подмена DOM — сеть не затрагивается.',

  // Выбор элемента.
  'domOverride.pick': 'Выбрать элемент',
  'domOverride.repick': 'Выбрать другой',
  'domOverride.selector': 'Селектор',
  'domOverride.pickedNone': '— не выбран —',

  // Операция.
  'domOverride.section.form': 'Настройка подмены',
  'domOverride.op.label': 'Операция',
  'domOverride.op.replace-text': 'Заменить текст',
  'domOverride.op.set-attribute': 'Задать атрибут',
  'domOverride.op.remove-attribute': 'Удалить атрибут',
  'domOverride.op.hide': 'Скрыть элемент',
  'domOverride.op.inject-content': 'Вставить длинный текст',

  // Поля формы операции.
  'domOverride.field.text': 'Текст',
  'domOverride.field.attrName': 'Имя атрибута',
  'domOverride.field.attrValue': 'Значение атрибута',
  'domOverride.field.injectText': 'Единица-заготовка',
  'domOverride.field.injectPlaceholder': 'напр. Lorem ipsum dolor sit amet',
  'domOverride.field.repeat': 'Повторов',

  // Действия.
  'domOverride.add': 'Применить подмену',
  'domOverride.update': 'Обновить подмену',
  'domOverride.clearAll': 'Снять всё',
  'domOverride.cancel': 'Отмена',
  'domOverride.remove': 'Удалить',
  'domOverride.active.enabled': 'Включена',

  // Список активных подмен.
  'domOverride.active.title': 'Активные подмены',
  'domOverride.active.empty': 'Подмен пока нет — выберите элемент и примените операцию.',

  // Статус.
  'domOverride.status.applied': 'Применено подмен: {count}',

  // Ошибки.
  'domOverride.error.pickFirst': 'Сначала выберите элемент на странице.',
  'domOverride.error.invalidOp': 'Некорректная операция: {reasons}',
  'domOverride.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы применять подмены.',
  'domOverride.error.noTab': 'Не удалось определить активную вкладку.',
  'domOverride.error.cancelled': 'Выбор отменён.',
  'domOverride.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',

  // Причины невалидности операции.
  'domOverride.reason.attr-name-empty': 'пустое имя атрибута',
  'domOverride.reason.attr-name-invalid': 'недопустимое имя атрибута',
  'domOverride.reason.repeat-invalid': 'число повторов должно быть положительным',

  // — v3 redesign (экран «Редактировать содержимое страницы») —
  'feature.domOverride.intro':
    'Меняйте вид страницы без сервера: текст, скрытие блоков, проверка длинного контента.',
  'domOverride.pickCta': 'Выбрать элемент',
  'domOverride.picking': 'Кликните элемент на странице…',
  'domOverride.act.text': 'Изменить текст',
  'domOverride.act.long': 'Очень длинный текст',
  'domOverride.act.hide': 'Скрыть',
  'domOverride.act.empty': 'Сделать пустым',
  'domOverride.act.label': 'Что изменить',
  'domOverride.field.newText': 'Новый текст',
  'domOverride.applyCta': 'Применить',
  'domOverride.changes.title': 'Активные подмены',
  'domOverride.changes.empty': 'Подмен пока нет',
  'domOverride.changes.note': 'Подмены повторяются после перезагрузки. Меняется только выбранное.',
  'domOverride.changes.clearAll': 'Снять всё',
  'domOverride.desc.textPrefix': 'текст → ',
  'domOverride.desc.emptied': 'очищено',
  'domOverride.desc.hidden': 'скрыто',
  'domOverride.desc.long': 'длинный текст',
  'domOverride.status.mirror': '{n} подмен',
};

export default ru;

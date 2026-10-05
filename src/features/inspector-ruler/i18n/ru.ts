// Русские строки фичи «Инспектор: линейка / измеритель» (TASK-018).
const ru: Record<string, string> = {
  'feature.ruler.title': 'Линейка',
  'feature.ruler.desc':
    'Измеряет расстояния и выравнивание между двумя элементами и показывает box-model выбранного узла (content/padding/border/margin).',

  'ruler.instructions':
    'Выберите режим: измерить зазор между двумя элементами (A↔B) или показать box-model одного элемента. Выбор — кликом по узлу на странице.',
  'ruler.mode': 'Режим',
  'ruler.mode.ab': 'Между элементами',
  'ruler.mode.box': 'Box-model',
  'ruler.mode.free': 'Свободная линейка',
  'ruler.units': 'Единицы',
  'ruler.units.px': 'px',
  'ruler.units.rem': 'rem',
  'ruler.cancel': 'Отмена',

  // v3 «Осмотр страницы» — линейка.
  'ruler.seg.pair': 'Два элемента',
  'ruler.seg.free': 'Свободно',
  'ruler.seg.box': 'Отступы',
  'ruler.start': 'Начать измерение',
  'ruler.stop': 'Остановить (Esc)',
  'ruler.remeasure': 'Измерить заново',
  'ruler.measuringStatus': 'измерение',
  'ruler.width': 'ширина',
  'ruler.height': 'высота',
  'ruler.hint.ab': 'Кликните элемент A, затем B на странице.',
  'ruler.hint.free': 'Протяните прямоугольник на странице.',
  'ruler.hint.box': 'Кликните элемент, чтобы увидеть отступы.',
  'ruler.row.vgap': 'Зазор по вертикали',
  'ruler.row.hoffset': 'Смещение по горизонтали',
  'ruler.row.ledge': 'Разница левых кромок',
  'ruler.row.centers': 'Между центрами',

  'ruler.pickA': 'Выбрать A',
  'ruler.pickB': 'Выбрать B',
  'ruler.repickA': 'Заменить A',
  'ruler.repickB': 'Заменить B',
  'ruler.pickElement': 'Выбрать элемент',
  'ruler.repickElement': 'Выбрать другой',
  'ruler.elementA': 'Элемент A',
  'ruler.elementB': 'Элемент B',
  'ruler.pickHint': 'Нажмите и кликните по элементу на странице.',

  'ruler.measurement': 'Измерение',
  'ruler.gap': 'Зазор',
  'ruler.overlap': 'Перекрытие',
  'ruler.edges': 'Кромки',
  'ruler.center': 'Центры',
  'ruler.aligned': 'Выравнивание',
  'ruler.aligned.none': 'нет совпадений',
  'ruler.copy': 'Копировать измерение',

  'ruler.box.title': 'Box-model',
  'ruler.box.content': 'Контент',
  'ruler.box.padding': 'Padding',
  'ruler.box.border': 'Border',
  'ruler.box.margin': 'Margin',
  'ruler.box.size': 'Размер',

  'ruler.free.hint':
    'Нажмите «Начать» и протяните мышью мерку по странице от точки A к B. Esc — отмена.',
  'ruler.free.start': 'Начать измерение',
  'ruler.free.snap': 'Примагничивать к кромкам',
  'ruler.free.length': 'Длина',
  'ruler.free.delta': 'Смещение',
  'ruler.free.size': 'Габариты',
  'ruler.free.angle': 'Угол',

  'ruler.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы измерять на вкладке.',
  'ruler.error.noTab': 'Не удалось определить активную вкладку.',
  'ruler.error.cancelled': 'Выбор отменён.',
  'ruler.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

// Русские строки фичи «Snapshot-diff» (TASK-028).
const ru: Record<string, string> = {
  'feature.snapshotDiff.title': 'Снимки DOM (было/стало)',
  'feature.snapshotDiff.desc':
    'Снимает сериализуемые снимки структуры DOM, ключевых вычисленных стилей, текста и атрибутов активной вкладки и показывает структурированный диф двух состояний: добавленные, удалённые и изменённые узлы с пер-свойственными различиями. Клик по строке подсвечивает узел на странице.',

  'snapshotDiff.instructions':
    'Снимите состояние «A», выполните действие на странице, затем снимите «B» — ниже появится диф. Фильтры переключают показ без повторного снятия.',
  'snapshotDiff.captureA': 'Снять A',
  'snapshotDiff.captureB': 'Снять B',
  'snapshotDiff.recaptureA': 'Переснять A',
  'snapshotDiff.recaptureB': 'Переснять B',
  'snapshotDiff.cancel': 'Отмена',
  'snapshotDiff.clear': 'Сбросить',

  'snapshotDiff.stateA': 'Снимок A',
  'snapshotDiff.stateB': 'Снимок B',
  'snapshotDiff.captured': 'снято узлов: {count}',
  'snapshotDiff.notCaptured': 'не снят',
  'snapshotDiff.truncated': 'Снято {visited} из бюджета {budget} узлов',
  'snapshotDiff.needBoth': 'Снимите оба состояния (A и B), чтобы увидеть диф.',
  'snapshotDiff.noChanges': 'Различий между снимками нет.',
  'snapshotDiff.noneForFilter': 'Под выбранный фильтр изменений нет.',

  'snapshotDiff.filter': 'Фильтр',
  'snapshotDiff.filter.all': 'Все',
  'snapshotDiff.filter.structure': 'Структура',
  'snapshotDiff.filter.styles': 'Стили',
  'snapshotDiff.filter.text': 'Текст',

  // v3 «Осмотр страницы» — сравнение состояний.
  'snapshotDiff.diffIntro':
    'Снимите состояние, сделайте действие на странице (например, отправьте форму) и снимите ещё раз. Увидите, что изменилось.',
  'snapshotDiff.step1': 'Шаг 1',
  'snapshotDiff.step2': 'Шаг 2',
  'snapshotDiff.before': 'До',
  'snapshotDiff.after': 'После',
  'snapshotDiff.tileTaken': 'Снят в {time} · {count} элементов',
  'snapshotDiff.tileEmpty': 'Нажмите, чтобы снять',
  'snapshotDiff.saved': 'Снимок сохранён',
  'snapshotDiff.startOver': 'Начать заново',
  'snapshotDiff.rowAdded': 'добавлен',
  'snapshotDiff.rowRemoved': 'удалён',

  'snapshotDiff.summary': 'Добавлено {added}, удалено {removed}, изменено {changed}',
  'snapshotDiff.section.added': 'Добавленные узлы',
  'snapshotDiff.section.removed': 'Удалённые узлы',
  'snapshotDiff.section.changed': 'Изменённые узлы',
  'snapshotDiff.change.text': 'текст',
  'snapshotDiff.change.attr': 'атрибут {name}',
  'snapshotDiff.change.style': 'стиль {prop}',
  'snapshotDiff.empty': '∅',
  'snapshotDiff.highlightHint': 'Подсветить на странице',
  'snapshotDiff.notFound': 'Узел уже отсутствует на странице.',

  'snapshotDiff.export': 'Экспорт',
  'snapshotDiff.export.json': 'JSON',
  'snapshotDiff.export.markdown': 'Markdown',

  'snapshotDiff.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы снимать состояние вкладок.',
  'snapshotDiff.error.noTab': 'Не удалось определить активную вкладку.',
  'snapshotDiff.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

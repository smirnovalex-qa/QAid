// Русские строки фичи «Запись экрана с аудио» (TASK-037).
const ru: Record<string, string> = {
  'feature.screenRecording.title': 'Запись экрана',
  'feature.screenRecording.desc':
    'Запись экрана, окна или вкладки с микрофоном и звуком системы. Что записать — выбираете в системном окне при каждом старте. Готовый ролик доступен для предпросмотра и скачивания — всё локально, ничего не выгружается.',

  // Аудио-опции.
  'screenRecording.audio': 'Звук',
  'screenRecording.audio.none': 'без звука',
  'screenRecording.mic': 'Микрофон',
  'screenRecording.mic.help': 'Комментируйте голосом',
  'screenRecording.systemAudio': 'Звук страницы',
  'screenRecording.systemAudio.help': 'Включите «Поделиться звуком» в следующем окне',
  'screenRecording.max': 'макс',

  // Лимит длительности.
  'screenRecording.duration': 'Максимальная длительность',
  'screenRecording.stopsAfter': 'Остановить через',
  'screenRecording.duration.min': '{count} мин',

  // Кнопки управления.
  'screenRecording.start': 'Выбрать, что записывать',
  'screenRecording.stop': 'Стоп',
  'screenRecording.pause': 'Пауза',
  'screenRecording.resume': 'Продолжить',
  'screenRecording.stopsIn': 'Остановится через',
  'screenRecording.rec': 'REC',
  'screenRecording.pausedShort': 'пауза',

  // Живые индикаторы.
  'screenRecording.timer': 'Длительность записи',
  'screenRecording.size': 'Размер',
  'screenRecording.sizeWarning':
    'Файл приближается к мягкому лимиту размера — остановите запись, чтобы не потерять ролик.',

  // Статусы состояния.
  'screenRecording.status.requesting': 'Запрашиваю источник…',
  'screenRecording.status.recording': 'Идёт запись',
  'screenRecording.status.paused': 'Пауза',
  'screenRecording.status.finalizing': 'Собираю файл…',

  // Результат / экспорт.
  'screenRecording.preview': 'Предпросмотр записи',
  'screenRecording.play': 'Смотреть',
  'screenRecording.format': 'Формат скачивания',
  'screenRecording.fmt.webm': 'Видео (WebM)',
  'screenRecording.fmt.gif': 'GIF',
  'screenRecording.gifNote': 'GIF без звука. Подходит для коротких демо до 30 с.',
  'screenRecording.download': 'Скачать видео',
  'screenRecording.confirmDownload': 'Скачать записанный ролик как файл WebM на устройство?',
  'screenRecording.downloaded': 'Видео сохранено в «Загрузки»',
  'screenRecording.downloadGif': 'Скачать GIF',
  'screenRecording.confirmDownloadGif':
    'Сконвертировать запись в анимированный GIF и скачать? В GIF нет звука, а частота кадров и размер снижены — лучше для коротких роликов.',
  'screenRecording.gifExporting': 'Создаю GIF…',
  'screenRecording.gifDownloaded': 'GIF сохранён в «Загрузки»',
  'screenRecording.again': 'Записать заново',
  'screenRecording.discard': 'Удалить',
  'screenRecording.confirm': 'Подтвердить',
  'screenRecording.cancel': 'Отмена',

  // Приватность.
  'screenRecording.privacy':
    'Браузер спросит, что показать: вкладку, окно или весь экран. Видео никуда не загружается.',

  // Ошибки.
  'screenRecording.error.startFailed': 'Не удалось начать запись. Попробуйте ещё раз.',
  'screenRecording.error.cancelled': 'Запись отменена.',
  'screenRecording.error.permissionDenied': 'Доступ отклонён. Разрешите захват, чтобы записать.',
  'screenRecording.error.micDenied':
    'Доступ к микрофону отклонён. Разрешите микрофон или выключите его, затем начните снова.',
  'screenRecording.error.unsupported': 'Запись видео не поддерживается этим браузером.',
  'screenRecording.error.captureFailed': 'Не удалось построить поток захвата.',
  'screenRecording.error.recorderFailed': 'Сбой рекордера во время записи.',
  'screenRecording.error.noData': 'Запись завершилась пустой — данных нет.',
  'screenRecording.error.download': 'Не удалось подготовить файл к скачиванию.',
  'screenRecording.error.gifExport':
    'Не удалось собрать GIF. Попробуйте более короткий ролик или скачайте WebM.',
};

export default ru;

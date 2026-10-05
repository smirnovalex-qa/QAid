// Русские строки фичи «Эмуляция окружения» (TASK-019).
const ru: Record<string, string> = {
  'feature.environment.title': 'Эмуляция окружения',
  'feature.environment.desc':
    'Подменяет User-Agent, язык, таймзону и геолокацию активной вкладки, а также правит query-флаги в URL. Полезно для проверки локализации, гео-логики и фиче-флагов без смены устройства.',

  // Мастер-тумблер и глобальные действия.
  'environment.master.label': 'Эмуляция включена',
  'environment.apply': 'Применить',
  'environment.clearAll': 'Снять всё',

  // v3-редизайн — карточки каналов, строка сайта, сводка.
  'environment.currentTab': '· текущая вкладка',
  'environment.channel.ua': 'Устройство (User-Agent)',
  'environment.channel.lang': 'Язык',
  'environment.channel.geo': 'Геолокация',
  'environment.channel.tz': 'Часовой пояс',
  'environment.channel.flags': 'Флаги в URL',
  'environment.offReal': 'Выключено — реальное значение',
  'environment.allOff': 'Выключить всё',
  'environment.summary': '{count} эмуляций включено на вкладке',
  'environment.toolStatus': '{count} активно',
  'environment.geo.deny': 'Доступ запрещён',
  'environment.tzNote':
    'Меняются даты в JavaScript; движок браузера местами может использовать реальный пояс.',
  'environment.footerNote':
    'Действует только на эту вкладку. Выключение возвращает реальное значение.',

  // Строка статуса.
  'environment.status.on': 'Эмуляция активна',
  'environment.status.off': 'Эмуляция выключена',
  'environment.status.applying': 'Применяем…',

  // Сводка активных подмен.
  'environment.overrides.label': 'Активные подмены:',
  'environment.overrides.none': 'Ничего не подменяется',
  'environment.overrides.ua': 'User-Agent',
  'environment.overrides.lang': 'Язык',
  'environment.overrides.tz': 'Таймзона',
  'environment.overrides.geo': 'Геолокация',
  'environment.overrides.flags': 'Флаги: {count}',

  // Заголовки секций.
  'environment.section.ua': 'User-Agent',
  'environment.section.lang': 'Accept-Language',
  'environment.section.tz': 'Таймзона',
  'environment.section.geo': 'Геолокация',
  'environment.section.flags': 'Query-флаги',

  // Пресеты User-Agent.
  'environment.ua.preset.chromeWin': 'Chrome · Windows',
  'environment.ua.preset.safariMac': 'Safari · macOS',
  'environment.ua.preset.safariIos': 'Safari · iOS',
  'environment.ua.preset.chromeAndroid': 'Chrome · Android',
  'environment.ua.preset.googlebot': 'Googlebot',

  // User-Agent — контролы.
  'environment.ua.select.label': 'Пресет User-Agent',
  'environment.ua.input.label': 'Строка User-Agent',
  'environment.ua.input.placeholder': 'Своя строка User-Agent',
  'environment.ua.none': '— без подмены —',
  'environment.ua.custom': 'Своя строка',
  'environment.ua.invalid': 'Некорректная строка User-Agent.',

  // Пресеты языка.
  'environment.lang.preset.enUs': 'English (США)',
  'environment.lang.preset.ruRu': 'Русский (Россия)',
  'environment.lang.preset.deDe': 'Deutsch (Германия)',
  'environment.lang.preset.frFr': 'Français (Франция)',
  'environment.lang.preset.jaJp': '日本語 (Япония)',

  // Accept-Language — контролы.
  'environment.lang.select.label': 'Пресет языка',
  'environment.lang.input.label': 'Значение Accept-Language',
  'environment.lang.input.placeholder': 'напр. fr-FR,fr;q=0.9,en;q=0.8',
  'environment.lang.none': '— без подмены —',
  'environment.lang.custom': 'Своё значение',
  'environment.lang.invalid': 'Некорректное значение Accept-Language.',

  // Пресеты таймзоны.
  'environment.tz.preset.utc': 'UTC',
  'environment.tz.preset.la': 'Лос-Анджелес',
  'environment.tz.preset.ny': 'Нью-Йорк',
  'environment.tz.preset.london': 'Лондон',
  'environment.tz.preset.paris': 'Париж',
  'environment.tz.preset.moscow': 'Москва',
  'environment.tz.preset.tokyo': 'Токио',

  // Таймзона — контролы.
  'environment.tz.select.label': 'Пресет таймзоны',
  'environment.tz.input.label': 'IANA-таймзона',
  'environment.tz.input.placeholder': 'напр. Europe/Paris',
  'environment.tz.none': '— без подмены —',
  'environment.tz.custom': 'Своя таймзона',
  'environment.tz.invalid': 'Неизвестная IANA-таймзона.',

  // Пресеты геолокации.
  'environment.geo.preset.sf': 'Сан-Франциско',
  'environment.geo.preset.ny': 'Нью-Йорк',
  'environment.geo.preset.london': 'Лондон',
  'environment.geo.preset.paris': 'Париж',
  'environment.geo.preset.moscow': 'Москва',
  'environment.geo.preset.tokyo': 'Токио',

  // Геолокация — контролы.
  'environment.geo.mode.label': 'Режим',
  'environment.geo.mode.off': 'Без подмены',
  'environment.geo.mode.coords': 'Координаты',
  'environment.geo.mode.error': 'Ошибка',
  'environment.geo.preset.label': 'Город',
  'environment.geo.preset.none': '— выбрать —',
  'environment.geo.latitude': 'Широта',
  'environment.geo.longitude': 'Долгота',
  'environment.geo.accuracy': 'Точность, м',
  'environment.geo.latitude.invalid': 'Широта должна быть в диапазоне −90…90.',
  'environment.geo.longitude.invalid': 'Долгота должна быть в диапазоне −180…180.',
  'environment.geo.accuracy.invalid': 'Точность — неотрицательное число.',
  'environment.geo.errorCode.label': 'Код ошибки',
  'environment.geo.errorCode.denied': '1 — доступ запрещён',
  'environment.geo.errorCode.unavailable': '2 — позиция недоступна',
  'environment.geo.errorCode.timeout': '3 — таймаут',

  // Query-флаги.
  'environment.flags.key': 'Ключ',
  'environment.flags.value': 'Значение',
  'environment.flags.enabled': 'Включён',
  'environment.flags.keyPlaceholder': 'напр. feature',
  'environment.flags.valuePlaceholder': 'напр. on',
  'environment.flags.add': 'Добавить флаг',
  'environment.flags.remove': 'Удалить флаг',
  'environment.flags.apply': 'Применить к URL',
  'environment.flags.empty': 'Флагов пока нет — добавьте первый.',
  'environment.flags.applied': 'URL вкладки обновлён.',

  // Ошибки.
  'environment.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы подменять окружение.',
  'environment.error.noTab': 'Не удалось определить активную вкладку.',
  'environment.error.noUrl': 'Не удалось прочитать URL активной вкладки.',
  'environment.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
};

export default ru;

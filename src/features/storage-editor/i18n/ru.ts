// Русские строки фичи «Состояние браузера: редактор storage/cookies» (TASK-017).
const ru: Record<string, string> = {
  'feature.storageEditor.title': 'Storage и cookies',
  'feature.storageEditor.desc':
    'Просмотр, правка и удаление cookies, localStorage и sessionStorage активной вкладки. Экспорт/импорт снимка и быстрая очистка состояния домена одной кнопкой.',

  'storage.tab.cookies': 'Cookies',
  'storage.tab.local': 'Local storage',
  'storage.tab.session': 'Session storage',
  'storage.tab.indexeddb': 'IndexedDB',
  'storage.tab.cache': 'Cache Storage',

  'storage.currentTab': '· текущая вкладка',
  'storage.load': 'Загрузить',
  'storage.reload': 'Обновить',
  'storage.cancel': 'Отмена',
  'storage.origin': 'Origin',
  'storage.domain': 'Домен',
  'storage.search': 'Фильтр по ключу',
  'storage.searchCookie': 'Фильтр по имени',

  'storage.empty': 'Ничего не загружено — нажмите «Загрузить».',
  'storage.noEntries': 'В этой области нет записей.',
  'storage.noCookies': 'Для этого домена нет cookies.',
  'storage.noResults': 'Ничего не соответствует фильтру.',

  'storage.key': 'Ключ',
  'storage.value': 'Значение',
  'storage.name': 'Имя',
  'storage.path': 'Путь',
  'storage.expires': 'Истекает',
  'storage.sameSite': 'SameSite',
  'storage.secure': 'Secure',
  'storage.httpOnly': 'HttpOnly',
  'storage.session': 'Сессионная',
  'storage.attributes': 'Атрибуты',

  'storage.add': 'Добавить',
  'storage.addEntry': 'Добавить запись',
  'storage.addCookie': 'Добавить cookie',
  'storage.save': 'Сохранить',
  'storage.remove': 'Удалить',
  'storage.copy': 'Копировать',
  'storage.prettyJson': 'Формат JSON',

  // Редизайн — карточки просмотра/правки
  'storage.add.key': 'Ключ',
  'storage.add.record': 'Запись',
  'storage.add.cookie': 'Cookie',
  'storage.newKey': 'Ключ',
  'storage.newKey.cookie': 'Имя cookie',
  'storage.keyPlaceholder': 'my.key',
  'storage.keyPlaceholder.cookie': 'session_id',
  'storage.valuePlaceholder': 'строка или JSON…',
  'storage.responseBody': 'Тело ответа',
  'storage.wipeAll': 'Очистить всё',
  'storage.emptyFilter': 'Ничего не найдено по фильтру',
  'storage.emptyAdd': 'Пусто — добавьте первую запись',
  'storage.summary.keys': 'ключей',
  'storage.summary.cookies': 'cookies',
  'storage.summary.records': 'записей',
  'storage.summary.responses': 'ответов',

  'storage.clearArea': 'Очистить область',
  'storage.clearCookies': 'Очистить cookies',
  'storage.quickWipe': 'Быстрая очистка',
  'storage.quickWipeHint': 'Очистить localStorage, sessionStorage и cookies этого домена.',

  // Редизайн — двухшаговая «очистка всех данных сайта»
  'storage.clearAll': 'Очистить все данные сайта',
  'storage.clearAllConfirm': 'Да, очистить все данные сайта',
  'storage.clearWarn': 'Удалит cookies, хранилище, IndexedDB и кэш сайта. Вы выйдете из аккаунта.',
  'storage.wipeToast': 'Удалено записей: {count}.',

  // Редизайн — грид снимков (экспорт / импорт)
  'storage.snapshotSave': 'Сохранить снимок',
  'storage.snapshotLoad': 'Загрузить снимок',

  'storage.export': 'Экспорт снимка',
  'storage.import': 'Импорт снимка',
  'storage.importPlaceholder': 'Вставьте сюда экспортированный снимок (JSON)…',
  'storage.importPreview': 'Предпросмотр импорта',
  'storage.importApply': 'Применить импорт',
  'storage.importInvalid': 'Это не валидный снимок (JSON).',
  'storage.diff': 'Добавится {added}, изменится {changed}, вне импорта {removed}',

  'storage.confirm': 'Подтвердить',
  'storage.confirmWipe':
    'Удалить ВСЕ localStorage, sessionStorage и cookies этого домена? Действие необратимо.',
  'storage.confirmClearArea': 'Удалить все записи этой области? Действие необратимо.',
  'storage.confirmClearCookies': 'Удалить все cookies этого домена? Действие необратимо.',
  'storage.confirmImport': 'Применить этот снимок к текущей вкладке?',

  'storage.report.wiped': 'Удалено записей: {count}.',
  'storage.report.cleared': 'Очищено записей: {count}.',
  'storage.report.removed': 'Удалено.',
  'storage.report.saved': 'Сохранено.',
  'storage.report.imported': 'Импортировано записей: {count}.',

  'storage.httpOnlyNote': 'HttpOnly-cookies здесь редактируемы — недоступно JS страницы.',
  'storage.cookiesDenied':
    'Доступ к cookies отклонён. Выдайте право «cookies», чтобы смотреть и править cookies. Вкладки storage продолжают работать.',
  'storage.grantCookies': 'Выдать доступ к cookies',

  'storage.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы читать storage вкладки.',
  'storage.error.noTab':
    'Не удалось прочитать эту вкладку (привилегированная/ограниченная страница).',
  'storage.error.invalidCookie': 'Некорректные атрибуты cookie: {reasons}.',
  'storage.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',

  // IndexedDB (TASK-031)
  'storage.idb.noDatabases': 'На этом домене нет баз IndexedDB.',
  'storage.idb.noStores': 'В этой базе нет object stores.',
  'storage.idb.noRecords': 'В этом store нет записей.',
  'storage.idb.keyPath': 'Ключ',
  'storage.idb.truncated': 'Данные усечены по бюджету — правка недоступна для усечённых записей.',
  'storage.idb.deleteDb': 'Удалить базу',
  'storage.idb.clearStore': 'Очистить store',
  'storage.idb.wipe': 'Очистить весь IndexedDB',
  'storage.idb.wipeHint': 'Удалить все базы IndexedDB этого домена.',
  'storage.idb.badValue': 'Значение должно быть корректным JSON.',
  'storage.idb.confirmDeleteDb': 'Удалить базу «{db}» целиком? Действие необратимо.',
  'storage.idb.confirmClearStore': 'Очистить все записи store «{store}»? Действие необратимо.',
  'storage.idb.confirmWipe': 'Удалить ВСЕ базы IndexedDB этого домена? Действие необратимо.',

  // Cache Storage (TASK-031)
  'storage.cache.noCaches': 'На этом домене нет кэшей Cache Storage.',
  'storage.cache.noEntries': 'В этом кэше нет записей.',
  'storage.cache.deleteCache': 'Удалить кэш',
  'storage.cache.wipe': 'Очистить весь Cache Storage',
  'storage.cache.wipeHint': 'Удалить все кэши Cache Storage этого домена.',
  'storage.cache.confirmDeleteCache': 'Удалить кэш «{cache}» целиком? Действие необратимо.',
  'storage.cache.confirmWipe': 'Удалить ВСЕ кэши Cache Storage этого домена? Действие необратимо.',
  'storage.cache.omitted.binary': 'Бинарное тело — не показано.',
  'storage.cache.omitted.too-large': 'Тело слишком большое — не показано.',
  'storage.cache.omitted.opaque': 'Opaque-ответ (cross-origin) — тело недоступно.',
  'storage.cache.omitted.empty': 'Пустое тело.',
  'storage.cache.omitted.error': 'Не удалось прочитать тело.',
  'storage.cache.omitted.none': 'Ответ отсутствует.',

  'storage.reason.name-empty': 'имя обязательно',
  'storage.reason.domain-empty': 'домен обязателен',
  'storage.reason.path-slash': 'путь должен начинаться с «/»',
  'storage.reason.samesite-invalid': 'недопустимый SameSite',
  'storage.reason.expires-invalid': 'некорректная дата истечения',
  'storage.reason.samesite-none-insecure': 'SameSite=None требует Secure',
};

export default ru;

// Русские строки фичи «Синк настроек и пресетов между устройствами» (TASK-029).
const ru: Record<string, string> = {
  'feature.settingsSync.title': 'Синк настроек',
  'feature.settingsSync.desc':
    'Переносит выбранные настройки и пресеты между вашими устройствами через аккаунт браузера (chrome.storage.sync). Без нашего сервера.',

  'ss.enable': 'Включить синк',
  'ss.enabledStatus': 'Синк включён',
  'ss.disabledStatus': 'Синк выключен',
  'ss.unavailable': 'Синхронизация недоступна в этой среде — настройки работают локально.',

  'ss.privacyTitle': 'Приватность',
  'ss.privacyWarning':
    'Пресеты могут содержать введённые вами данные. Секции с секретами (снимки storage/cookies, логи) не синкаются никогда.',
  'ss.ack': 'Я понимаю, что синкаемые пресеты могут содержать введённые данные',

  'ss.namespaces': 'Что синкать',
  'ss.selectHint': 'Отметьте пространства для синка. Слишком большие для квоты — недоступны.',
  'ss.sensitive': 'Может содержать введённые данные',
  'ss.readonly': 'Только чтение',

  'ss.syncNow': 'Синхронизировать сейчас',
  'ss.lastSync': 'Последняя синхронизация: {time}',
  'ss.never': 'ещё не было',

  'ss.conflictMarker': 'Изменено на другом устройстве — разрешено по последней записи',
  'ss.quotaExceeded': 'Не влезает в квоту sync ({bytes}/{limit} Б) — синк недоступен',
  'ss.itemsExceeded': 'Превышено число элементов sync — синк недоступен',

  'ss.disableAndClear': 'Выключить и очистить sync',
  'ss.confirmDisable':
    'Выключить синк и удалить синкаемые данные из аккаунта браузера? Локальные настройки останутся.',
  'ss.confirm': 'Подтвердить',
  'ss.cancel': 'Отмена',

  'ss.errorGeneric': 'Не удалось синхронизировать',

  'ss.status.pushed': 'отправлено',
  'ss.status.pulled': 'получено',
  'ss.status.equal': 'актуально',
  'ss.status.idle': 'нет изменений',
  'ss.status.conflict': 'конфликт разрешён',
  'ss.status.quota': 'не влезает в квоту',
  'ss.status.error': 'ошибка',
  'ss.status.unavailable': 'недоступно',

  'ss.ns.app': 'Тема, язык и общие настройки',
  'ss.ns.random-numbers': 'Пресеты: случайные числа',
  'ss.ns.random-strings': 'Пресеты: случайные строки',
  'ss.ns.forms': 'Пресеты: формы',
};

export default ru;

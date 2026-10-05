// Русские строки фичи «Профили сессий: hot-swap авторизации» (TASK-047).
const ru: Record<string, string> = {
  'feature.sessionProfiles.title': 'Профили сессий',
  'feature.sessionProfiles.desc':
    'Сохраняйте именованные профили сессий по сайтам и горячо переключайте состояние авторизации (cookies + localStorage + sessionStorage). Local-first, секреты маскируются по умолчанию. Одна активная сессия на сайт — без изолированных параллельных сессий.',

  // v3-редизайн — строка сайта, сохранение, карточки, подтверждение свапа, сейф
  'sessionProfiles.currentTab': '· текущая вкладка',
  'sessionProfiles.saveLogin': 'Сохранить текущий вход как профиль',
  'sessionProfiles.saveLoginHelp': 'Сохранит cookies (включая HttpOnly) и хранилище этого сайта.',
  'sessionProfiles.cardMeta': 'Сохранён {date} · {cookies} cookies, {keys} ключей',
  'sessionProfiles.details': 'Подробнее',
  'sessionProfiles.swapReload': 'Переключить и обновить',
  'sessionProfiles.swap.replace': 'Полная замена (рекомендуется)',
  'sessionProfiles.swap.replaceHelp': 'Сначала удаляет текущий вход, чтобы ничего не смешалось',
  'sessionProfiles.swap.apply': 'Только добавить поверх',
  'sessionProfiles.swap.applyHelp': 'Оставляет текущие данные и записывает профиль поверх',
  'sessionProfiles.protect': 'Защитить паролем',
  'sessionProfiles.protectHelp':
    'Шифрует профили на этом компьютере. Пароль вводится раз за сессию браузера.',
  'sessionProfiles.footerNote':
    'Профили хранятся только на этом компьютере и не синхронизируются. Один активный вход на сайт.',

  // Тулбар / действия
  'sessionProfiles.load': 'Загрузить',
  'sessionProfiles.reload': 'Обновить',
  'sessionProfiles.cancel': 'Отмена',
  'sessionProfiles.save': 'Сохранить',
  'sessionProfiles.confirm': 'Подтвердить',
  'sessionProfiles.capture': 'Захватить текущую сессию',
  'sessionProfiles.create': 'Сохранить профиль',
  'sessionProfiles.switch': 'Переключить',
  'sessionProfiles.edit': 'Править',
  'sessionProfiles.duplicate': 'Дублировать',
  'sessionProfiles.delete': 'Удалить',
  'sessionProfiles.export': 'Экспорт',
  'sessionProfiles.import': 'Импорт профиля',
  'sessionProfiles.importPreview': 'Предпросмотр импорта',
  'sessionProfiles.reveal': 'Показать',
  'sessionProfiles.mask': 'Скрыть',

  // Поля
  'sessionProfiles.name': 'Название профиля',
  'sessionProfiles.namePlaceholder': 'напр. Admin, Guest, QA-пользователь…',
  'sessionProfiles.snapshotJson': 'Данные сессии (JSON: cookies + storage)',
  'sessionProfiles.importPlaceholder': 'Вставьте сюда экспортированный профиль (JSON)…',

  // Метки / секции
  'sessionProfiles.scope': 'Сайт',
  'sessionProfiles.active': 'Активен',
  'sessionProfiles.otherSites': 'Другие сайты',
  'sessionProfiles.empty':
    'Для этого сайта ещё нет профилей — захватите текущую сессию, чтобы создать первый.',
  'sessionProfiles.emptyOther': 'Профилей для других сайтов не сохранено.',
  'sessionProfiles.cookies': 'Cookies',
  'sessionProfiles.local': 'localStorage',
  'sessionProfiles.session': 'sessionStorage',
  'sessionProfiles.summary.cookies': 'cookies: {count}',
  'sessionProfiles.summary.local': 'local: {count}',
  'sessionProfiles.summary.session': 'session: {count}',

  // Режим замены
  'sessionProfiles.mode.label': 'Режим замены',
  'sessionProfiles.mode.replace': 'Заменить (с очисткой)',
  'sessionProfiles.mode.apply': 'Только применить',

  // Заметки
  'sessionProfiles.localTrustNote':
    'Профили хранятся локально и без шифрования (local-trust). Любой с доступом к этому профилю браузера может их прочитать. Включите «Защитить мастер-паролем», чтобы шифровать их at-rest.',

  // Сейф — опциональное at-rest-шифрование (TASK-050)
  'sessionProfiles.vault.status.disabled': 'Шифрование выключено',
  'sessionProfiles.vault.status.locked': '🔒 Заблокировано',
  'sessionProfiles.vault.status.unlocked': '🔓 Разблокировано',
  'sessionProfiles.vault.enable': 'Защитить мастер-паролем',
  'sessionProfiles.vault.enableConfirm': 'Включить шифрование',
  'sessionProfiles.vault.lock': 'Заблокировать',
  'sessionProfiles.vault.unlock': 'Разблокировать',
  'sessionProfiles.vault.disable': 'Отключить защиту',
  'sessionProfiles.vault.disableConfirm': 'Отключить и расшифровать',
  'sessionProfiles.vault.disableWarn':
    'Все профили будут расшифрованы обратно в открытый вид — их снова сможет прочитать любой с доступом к этому профилю браузера.',
  'sessionProfiles.vault.rekey': 'Ре-кей',
  'sessionProfiles.vault.rekeyConfirm': 'Выполнить ре-кей',
  'sessionProfiles.vault.rekeyWarn':
    'Сейф использует устаревшие параметры вывода ключа. Ре-кей перешифрует все профили под текущие параметры.',
  'sessionProfiles.vault.password': 'Мастер-пароль',
  'sessionProfiles.vault.confirm': 'Подтверждение пароля',
  'sessionProfiles.vault.currentPassword': 'Текущий мастер-пароль',
  'sessionProfiles.vault.threatNote':
    'Шифрует данные только at-rest — защищает украденную копию хранилища, но НЕ разблокированную сессию. Malware или другое расширение на вашей машине, а также тот, кто смотрит пока сейф разблокирован, всё равно прочитают секреты; а при переключении профиля его токены пишутся в живую сессию открытым текстом.',
  'sessionProfiles.vault.noRecovery':
    'Восстановления нет: если забыть мастер-пароль, зашифрованные профили не восстановить (zero-knowledge, без бэкдора).',
  'sessionProfiles.vault.autoLock': 'Авто-блокировка через (минут)',
  'sessionProfiles.vault.autoLockHint': 'От 1 до 240 минут.',
  'sessionProfiles.vault.understand':
    'Понимаю: восстановления нет — забытый пароль означает безвозвратную потерю зашифрованных профилей.',
  'sessionProfiles.vault.show': 'Показать',
  'sessionProfiles.vault.hide': 'Скрыть',
  'sessionProfiles.vault.showPassword': 'Показать пароль',
  'sessionProfiles.vault.hidePassword': 'Скрыть пароль',
  'sessionProfiles.vault.advanced': 'Опции сейфа',
  'sessionProfiles.vault.lockedEmpty': 'Для этого сайта профилей нет.',
  'sessionProfiles.vault.corrupt':
    'Часть профилей не удалось расшифровать (данные повреждены или подменены).',
  'sessionProfiles.vault.needUnlock': 'Сначала разблокируйте сейф.',
  'sessionProfiles.vault.exportWarn':
    'Экспортировать «{name}» ОТКРЫТЫМ файлом? Скопированный JSON содержит секреты в открытом виде.',
  'sessionProfiles.vault.strength.weak': 'Надёжность пароля: слабый — используйте длиннее.',
  'sessionProfiles.vault.strength.fair': 'Надёжность пароля: средний.',
  'sessionProfiles.vault.strength.strong': 'Надёжность пароля: надёжный.',
  'sessionProfiles.vault.report.enabled':
    'Шифрование включено. Профили теперь зашифрованы at-rest.',
  'sessionProfiles.vault.report.disabled': 'Шифрование выключено. Профили снова хранятся открыто.',
  'sessionProfiles.vault.report.rekeyed': 'Ре-кей выполнен под текущие параметры.',
  'sessionProfiles.vault.report.unlocked': 'Сейф разблокирован.',
  'sessionProfiles.vault.report.locked': 'Сейф заблокирован.',
  'sessionProfiles.vault.err.no-vault': 'Сейф не настроен.',
  'sessionProfiles.vault.err.already-enabled': 'Шифрование уже включено.',
  'sessionProfiles.vault.err.wrong-password': 'Неверный пароль.',
  'sessionProfiles.vault.err.locked': 'Сейф заблокирован.',
  'sessionProfiles.vault.err.decrypt-failed':
    'Не удалось расшифровать — данные повреждены или подменены.',
  'sessionProfiles.vault.err.invalid-snapshot':
    'Расшифрованные данные — не валидный снимок сессии.',
  'sessionProfiles.vault.err.empty': 'Введите мастер-пароль.',
  'sessionProfiles.vault.err.mismatch': 'Пароли не совпадают.',
  'sessionProfiles.cookiesNote':
    'Доступ к cookies отклонён — захватываются и переключаются только localStorage и sessionStorage. Выдайте право «cookies», чтобы включить cookies.',
  'sessionProfiles.scopeMismatch.origin':
    'Профиль сохранён на другом origin (тот же домен). Cookies применятся, но web storage относится к другому origin — применяйте осторожно.',
  'sessionProfiles.scopeMismatch.domain':
    'Профиль сохранён на другом сайте (другой домен). Скорее всего, здесь он не применится корректно.',

  // Подтверждения
  'sessionProfiles.confirmSwap':
    'Переключить сессию на этой вкладке? Прогноз: записать {applied}, удалить {removed}. Вкладка перезагрузится.',
  'sessionProfiles.confirmDelete': 'Удалить профиль «{name}»? Действие необратимо.',
  'sessionProfiles.confirmImport': 'Импортировать и сохранить профиль «{name}»?',
  'sessionProfiles.diff': 'Добавится {added}, изменится {changed}, вне профиля {removed}',

  // Отчёты
  'sessionProfiles.report.captured': 'Текущая сессия захвачена.',
  'sessionProfiles.report.swapped': 'Переключено: записано {applied}, удалено {removed}.',
  'sessionProfiles.report.saved': 'Сохранено.',
  'sessionProfiles.report.deleted': 'Удалено.',
  'sessionProfiles.report.duplicated': 'Дублировано.',
  'sessionProfiles.report.imported': 'Импортировано.',

  // Ошибки
  'sessionProfiles.error.noTab':
    'Не удалось прочитать эту вкладку (привилегированная/ограниченная страница).',
  'sessionProfiles.error.noScope':
    'Эта страница не является веб-сайтом (http/https) — профили сессий неприменимы.',
  'sessionProfiles.error.permissionDenied':
    'Доступ к страницам отклонён. Выдайте его, чтобы захватывать и переключать сессии.',
  'sessionProfiles.error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
  'sessionProfiles.error.invalidCookie': 'Некорректные атрибуты cookie: {reasons}.',
  'sessionProfiles.error.invalidSnapshot': 'Данные сессии — не валидный снимок (JSON).',
  'sessionProfiles.error.importInvalid': 'Это не валидный профиль сессии (JSON).',

  // Причины невалидности cookie (самодостаточно, без завязки на storage-editor)
  'sessionProfiles.reason.name-empty': 'имя обязательно',
  'sessionProfiles.reason.domain-empty': 'домен обязателен',
  'sessionProfiles.reason.path-slash': 'путь должен начинаться с «/»',
  'sessionProfiles.reason.samesite-invalid': 'недопустимый SameSite',
  'sessionProfiles.reason.expires-invalid': 'некорректная дата истечения',
  'sessionProfiles.reason.samesite-none-insecure': 'SameSite=None требует Secure',
};

export default ru;

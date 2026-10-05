/** Каталог локализации фичи «Экспорт состояния бага» (TASK-025) — русский. */
export default {
  'feature.bugReport.title': 'Экспорт состояния бага',
  'bugReport.desc':
    'Собрать состояние бага активной вкладки в приватный артефакт (Markdown + JSON) для трекера. Ничего никуда не отправляется.',

  'bugReport.loading': 'Загрузка…',

  'bugReport.note.title.label': 'Заголовок',
  'bugReport.note.title.placeholder': 'Краткая суть бага',
  'bugReport.note.steps.label': 'Шаги воспроизведения',
  'bugReport.note.steps.placeholder': '1. …\n2. …\nОжидалось / получили',

  'bugReport.sections.legend': 'Какие секции включить',
  'bugReport.section.environment': 'Окружение (UA, вьюпорт, локаль, время)',
  'bugReport.section.storage': 'Cookies и хранилище',
  'bugReport.section.console': 'Ошибки/предупреждения консоли',
  'bugReport.section.network': 'Сводка сети',
  'bugReport.section.timeline': 'Таймлайн действий (шаги воспроизведения)',
  'bugReport.section.note': 'Заметка репортёра',
  'bugReport.section.storage.warning':
    'Storage и cookies могут содержать секреты (токены, идентификаторы сессии). По умолчанию выключено — включайте осознанно; при необходимости включите маскирование.',

  'bugReport.mask.label': 'Скрыть пароли и токены',
  'bugReport.mask.hint': 'Заменяет значения cookies, «секретные» значения storage и токены в URL.',

  'bugReport.console.arm': 'Включить перехват консоли',
  'bugReport.console.disarm': 'Выключить перехват консоли',
  'bugReport.console.armed':
    'Перехват консоли включён — воспроизведите баг, затем соберите снимок.',
  'bugReport.console.notArmed':
    'Перехват консоли выключен — включите до воспроизведения, чтобы собрать логи.',

  'bugReport.network.arm': 'Записывать сетевые запросы',
  'bugReport.network.disarm': 'Остановить запись сети',
  'bugReport.network.armed': 'Запись сети включена — воспроизведите баг, затем соберите снимок.',
  'bugReport.network.notArmed':
    'Запись сети выключена — включите до воспроизведения (fetch/XHR логируются только при включённой записи). Совместима с «Мок сети».',

  'bugReport.timeline.legend': 'Запись шагов воспроизведения (авто)',
  'bugReport.timeline.start': 'Начать запись',
  'bugReport.timeline.stop': 'Остановить запись',
  'bugReport.timeline.pause': 'Пауза',
  'bugReport.timeline.resume': 'Продолжить',
  'bugReport.timeline.reset': 'Сбросить',
  'bugReport.timeline.recording': 'Идёт запись — воспроизведите баг, затем соберите снимок.',
  'bugReport.timeline.paused': 'Запись на паузе.',
  'bugReport.timeline.notRecording': 'Запись выключена — включите до воспроизведения.',
  'bugReport.timeline.maskInputs.label': 'Маскировать значения полей ввода (пароль — всегда)',
  'bugReport.timeline.limit.label': 'Лимит событий буфера (макс. 200)',
  'bugReport.timeline.hint':
    'Записываются только значимые действия (клик/ввод/submit/навигация/жесты/resize) верхнего документа; iframes не охватываются. Значения ввода маскируются; селекторы и текст-подсказки могут содержать чувствительное — проверьте перед экспортом. Таймлайн прикладывается только по галочке секции.',

  'bugReport.preview.label': 'Предпросмотр (Markdown)',
  'bugReport.empty': 'Снимка ещё нет — заполните заметку, выберите секции и соберите.',
  'bugReport.copy': 'Копировать Markdown',
  'bugReport.download': 'Скачать…',
  'bugReport.download.prompt': 'Скачать артефакт как .md-файл на диск?',
  'bugReport.download.confirm': 'Скачать',
  'bugReport.download.cancel': 'Отмена',

  'bugReport.captured': 'Состояние бага собрано',
  'bugReport.downloaded': 'Артефакт скачан',
  'bugReport.error.permission': 'В праве на инъекцию отказано.',
  'bugReport.error.noTab': 'Нет активной вкладки.',
  'bugReport.error.generic': 'Не удалось собрать состояние бага.',

  // — Фазовый хендофф (редизайн v3 Capture) —
  'bugReport.intro':
    'Нажмите «Начать», повторите проблему на странице и вернитесь. Технические детали соберутся сами.',
  'bugReport.arm': 'Начать запись бага',
  'bugReport.skip': 'Баг уже случился?',
  'bugReport.skipHelp': 'Создать отчёт по текущему состоянию',
  'bugReport.collects': 'Соберём',
  'bugReport.none': 'ничего',
  'bugReport.change': 'Изменить',
  'bugReport.hide': 'Скрыть',
  'bugReport.privacy':
    'Ничего не отправляется автоматически. Вы сами решаете, что попадёт в отчёт.',

  // Каналы захвата (сворачиваемый список).
  'bugReport.channel.steps': 'Клики и шаги',
  'bugReport.channel.steps.help': 'Что вы нажимали, вводили, открывали',
  'bugReport.channel.console': 'Ошибки на странице',
  'bugReport.channel.console.help': 'Ошибки и предупреждения консоли',
  'bugReport.channel.network': 'Сетевые запросы',
  'bugReport.channel.network.help': 'Из «Подмены запросов», если она включена',
  'bugReport.channel.environment': 'Браузер и устройство',
  'bugReport.channel.environment.help': 'Версия, размер экрана, язык, время',
  'bugReport.channel.screenshot': 'Скриншот',
  'bugReport.channel.screenshot.help': 'Как выглядела страница',
  'bugReport.channel.storage.help': 'Может содержать пароли и токены',
  'bugReport.channel.dom': 'Код страницы (HTML)',
  'bugReport.channel.dom.help': 'Структура элементов',

  // Сессия захвата.
  'bugReport.capturing': 'Идёт запись',
  'bugReport.reproduceHint':
    'Перейдите на страницу и повторите баг. Панель можно закрыть — запись продолжится.',
  'bugReport.capture': 'Готово — создать отчёт',
  'bugReport.cancel': 'Отменить',
  'bugReport.armed.actions': 'действий',
  'bugReport.armed.errors': 'ошибок',
  'bugReport.armed.requests': 'запросов',
  'bugReport.count.steps': 'шаги',
  'bugReport.count.console': 'консоль',
  'bugReport.count.requests': 'запросы',

  // Готовый отчёт.
  'bugReport.newCapture': 'Новый захват',
  'bugReport.newReport': 'Новый',
  'bugReport.whatHappened': 'Что произошло',
  'bugReport.attached': 'Приложено — нажмите, чтобы убрать',
  'bugReport.att.actions': 'действий',
  'bugReport.att.errors': 'ошибок',
  'bugReport.att.requests': 'запросов',
  'bugReport.att.env': 'Браузер',
  'bugReport.att.screenshot': 'Скриншот',
  'bugReport.att.storage': 'Cookies',
  'bugReport.att.dom': 'HTML',
  'bugReport.secretWarn':
    'В cookies могут быть токены входа. Оставьте «Скрыть пароли и токены» включённым.',
  'bugReport.capturedBadge': 'собрано',
  'bugReport.clip.sub': 'вставить вручную',
  'bugReport.sent.didntOpen': 'Не открылось?',
  'bugReport.sent.openSuffix': ' открыт. Нажмите там Enter.',
  'bugReport.downloadShot': 'Скачать скриншот',

  // Карточка отправки.
  'bugReport.send.legend': 'Отправить ИИ-ассистенту',
  'bugReport.send.sendPrefix': 'Отправить в ',
  'bugReport.send.sentPrefix': '✓ Отправлено в ',
  'bugReport.send.opening': 'Открываю…',
  'bugReport.send.or': 'Или:',
  'bugReport.copyAsText': 'Скопировать текстом',
  'bugReport.downloadFile': 'Скачать файл',

  // Сворачиваемый блок проекта.
  'bugReport.project': 'Проект',
  'bugReport.repoLabel': 'Репозиторий',
  'bugReport.folderLabel': 'Папка проекта на компьютере',
  'bugReport.projNote': 'Чтобы ассистент открыл нужный проект. Указывается один раз.',

  // Пилюля статуса (оболочка).
  'bugReport.status.capturing': 'запись бага',
  'bugReport.status.reportReady': 'отчёт готов',

  // Префилл заметки-шаблона.
  'bugReport.template.title': 'Кнопка «Оформить заказ» не реагирует',
  'bugReport.template.body':
    '1. Открыть /checkout с товаром в корзине\n2. Нажать «Оформить заказ»\n\nОжидалось: переход к оплате.\nНа деле: ничего не происходит.',

  'bugReport.projectOptions': 'Цель проекта и опции',
  'bugReport.include': 'Включить секции',
  'bugReport.chip.steps': 'Шаги',
  'bugReport.chip.console': 'Консоль',
  'bugReport.chip.network': 'Сеть',
  'bugReport.chip.storage': 'Storage',
  'bugReport.chip.environment': 'Окр.',
  'bugReport.chip.screenshot': 'Скрин',
  'bugReport.privacyNote':
    'Уходят только выбранные секции. Ничего в сеть — deep-link открывает агента локально, полный отчёт пишется в репозиторий.',

  // — Доставка агенту (TASK-040) —
  'bugReport.handoff.legend': 'Отправить агенту',
  'bugReport.handoff.consent':
    'Передаются только выбранные секции (с маскированием) — локально, ничего не уходит в сеть. Агент откроется с уже впечатанным промптом; Enter вы жмёте сами.',
  'bugReport.handoff.target.label': 'Адресат',
  'bugReport.handoff.send': 'Отправить агенту',
  'bugReport.handoff.needArtifact': 'Сначала соберите состояние бага, затем отправьте агенту.',

  'bugReport.handoff.target.clipboard': 'Буфер обмена (промпт)',
  'bugReport.handoff.target.projectFolder': 'Папка проекта (полный артефакт)',

  'bugReport.handoff.msg.copied': 'Промпт скопирован — вставьте его в агента.',
  'bugReport.handoff.msg.copyFailed': 'Не удалось скопировать в буфер.',
  'bugReport.handoff.msg.fsUnavailable':
    'File System Access здесь недоступен — скопируйте артефакт.',
  'bugReport.handoff.msg.written': 'Записано в {path} — откройте из агента.',

  'bugReport.handoff.fallback.copyFull': 'Копировать полный отчёт',
  'bugReport.handoff.fallback.copyPrompt': 'Копировать промпт',

  'bugReport.handoff.fs.noDir': 'Папка проекта ещё не выбрана — сначала выберите.',
  'bugReport.handoff.fs.denied': 'В доступе на запись в папку отказано.',
  'bugReport.handoff.fs.failed': 'Не удалось записать артефакт в папку.',

  'bugReport.handoff.project.legend': 'Таргет проекта (для deep-link)',
  'bugReport.handoff.project.hint':
    'Handle папки не раскрывает абсолютный путь, поэтому задайте repo/путь один раз. Предпочтительно repo — агент резолвит его в локальный клон. Если задаёте абсолютный cwd — он должен уже существовать на диске: терминальный вариант открывает Claude Code в нём, и несуществующий путь мгновенно закрывает окно. На Windows надёжнее вариант «десктоп-приложение»: он открывает GUI Claude (Windows Terminal не нужен) и берёт абсолютный путь как рабочую папку; оставьте repo/cwd пустыми — откроется дефолтная папка.',
  'bugReport.handoff.project.repo.label': 'Репозиторий (owner/name)',
  'bugReport.handoff.project.repo.placeholder': 'acme/webapp',
  'bugReport.handoff.project.repo.invalid':
    'Формат «owner/name» (напр. acme/webapp) или оставьте пустым. Claude Code откроется и без него.',
  'bugReport.handoff.project.cwd.label': 'Абсолютный путь (опционально)',
  'bugReport.handoff.project.cwd.placeholder': '/home/me/projects/webapp',
  'bugReport.handoff.project.cwd.invalid':
    'Нужен абсолютный путь (напр. C:\\Users\\me\\webapp или /home/me/webapp), без «..». Обязателен для Cursor.',
  'bugReport.handoff.project.pick': 'Выбрать папку проекта…',
  'bugReport.handoff.project.pickHint':
    'Выбор папки надёжно работает в side panel — в popup ОС-диалог закрывает окно. Выберите корень репозитория, тогда отчёт ляжет в <repo>/.qanvil/bug-reports/latest.md.',
  'bugReport.handoff.project.pickedOn': 'Папка проекта выбрана',
  'bugReport.handoff.project.pickedOff': 'Папка проекта не выбрана',
  'bugReport.handoff.project.forget': 'Забыть папку',
  'bugReport.handoff.includeJson.label': 'Вкладывать полный JSON в промпт',
  'bugReport.handoff.promptLimit.label': 'Лимит промпта (символов)',

  // — Адресаты-агенты (TASK-043/044/045) —
  'bugReport.handoff.target.claudeCode': 'Claude Code (терминал)',
  'bugReport.handoff.target.claudeCodeDesktop': 'Claude Code (десктоп-приложение)',
  'bugReport.handoff.target.claudeCodeVscode': 'Claude Code (VS Code)',
  'bugReport.handoff.target.cursor': 'Cursor',
  'bugReport.handoff.target.codex': 'Codex',

  'bugReport.handoff.claudeCode.opened':
    'Claude Code открывается — нажмите Enter в поле ввода, чтобы запустить.',
  'bugReport.handoff.claudeCode.openedDesktop':
    'Открываю десктоп-приложение Claude с промптом — нажмите Enter в композере Code, чтобы запустить.',
  'bugReport.handoff.claudeCode.openedVscode':
    'Открываю в VS Code — нажмите Enter в поле ввода Claude Code.',
  'bugReport.handoff.claudeCode.openedNoTarget':
    'Claude Code открывается с промптом. Указанные repo/cwd невалидны и проигнорированы — поправьте их в «Таргете проекта», чтобы агент открылся в вашем проекте.',
  'bugReport.handoff.claudeCode.needTarget':
    'Задайте repo (owner/name) или абсолютный путь в «Таргете проекта», чтобы агент открылся в вашем проекте.',
  'bugReport.handoff.cursor.opened':
    'Cursor открывает файл отчёта — сошлитесь на него через @file в Cursor Chat.',
  'bugReport.handoff.cursor.needPath':
    'cursor://file требует абсолютный путь — задайте путь проекта (cwd) выше или используйте копирование ниже.',
  'bugReport.handoff.codex.opened':
    'Codex открывается с промптом — нажмите Enter, чтобы запустить.',
  'bugReport.handoff.msg.deepLinkFailed':
    'Не удалось собрать deep-link — используйте копирование ниже.',

  'bugReport.handoff.fallback.copyCommand': 'Копировать команду',
  'bugReport.handoff.fallback.copyFilePath': 'Копировать путь @file',

  // — Авто-обнаружение (TASK-042) —
  'bugReport.discovery.legend': 'Авто-обнаружение агентом (опционально)',
  'bugReport.discovery.intro':
    'Сгенерировать rule-файлы и MCP-конфиг, чтобы агент сам находил репорты («разбери последний баг» без пути). Опционально — deep-link + файл работают и так.',
  'bugReport.discovery.rule.heading': 'Rule-файл — {file}',
  'bugReport.discovery.mcp.heading': 'MCP-конфиг — {file}',
  'bugReport.discovery.write': 'Записать в проект',
  'bugReport.discovery.copy': 'Копировать',
  'bugReport.discovery.wrote': 'Записано в {path}',
  'bugReport.discovery.writeFailed': 'Не удалось записать в папку проекта.',
  'bugReport.discovery.copied': 'Скопировано в буфер',
  'bugReport.discovery.needDir':
    'Выберите папку проекта выше, чтобы записывать файлы (копирование доступно всегда).',
  'bugReport.discovery.mcpNote':
    'MCP-путь требует Node/npx и опционален. Конфиг Codex живёт в ~/.codex — только копирование.',
  'bugReport.discovery.pathNote':
    'Задайте путь проекта (cwd) выше, чтобы подставить абсолютный путь MCP; иначе показывается плейсхолдер <путь>.',
};

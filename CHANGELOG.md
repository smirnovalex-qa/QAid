# qaid

Журнал изменений ведётся автоматически через [changesets](https://github.com/changesets/changesets).
Новые версии добавляются сверху при выпуске Version PR (см. [RELEASING.md](./RELEASING.md)).

## 0.1.0

Первый публичный срез QAid — консолидированный набор QA-инструментов в одном
MV3-расширении Chrome. Local-first: ядро работает офлайн и не делает внешних
сетевых вызовов (ADR-0007). Три точки монтажа: popup, side panel и
перетаскиваемая плавающая панель поверх страницы.

### Каркас и ядро

- Каркас MV3-расширения: Vite + @crxjs, TypeScript strict, Preact + `@preact/signals`.
- Федеративный протокол сообщений, дескриптор фич (самодостаточные фичи: logic + ui +
  дескриптор), мост сред (ISOLATED/MAIN/background) и слой настроек.
- Дизайн-система и UI-shell (таксономия Home→Tool, ленивые панели) + общие UI-утилиты
  (copy / toast / export / validation).
- Единый источник версии — `package.json` (semver → `manifest.version`, полный semver в
  `version_name`, ADR-0019). Брокер прав least-privilege (ADR-0013).
- Локализация: каталоги `ru`/`en` (default_locale `ru`).

### Генераторы тест-данных

- Случайные числа и строки с настраиваемыми параметрами.
- Timestamp, хеши и UUID.
- Автозаполнение форм тест-данными с аудитом.

### Декодеры

- JWT, Base64, URL и JSON.

### Инспекторы страницы

- «Инспектор элемента»: computed-профиль, matched CSS rules / каскад, живой режим
  курсором и навигация по DOM-иерархии.
- Проверка контраста WCAG, палитра цветов страницы, инспектор шрифтов, линейка / отступы.

### Браузерные данные

- Редактор storage / cookies / IndexedDB / Cache.
- Профили сессий с hot-swap авторизации и опциональным шифрованием at-rest
  (WebCrypto: PBKDF2 + AES-GCM, ключ только в памяти, ADR-0051).
- Синк настроек между устройствами (`chrome.storage.sync`, opt-in; секреты не синкаются).

### Сеть

- Мок запросов: панель и ответы, сценарии, троттлинг / офлайн, replay с правками.
- CDP-режим перехвата (`chrome.debugger`) — ловит запросы в обход MAIN-обёрток
  (воркеры/`sendBeacon`, строгий CSP).
- Подмена DOM (DOM-override).

### Фиксация багов

- Экспорт «состояния бага»: URL + storage + консоль + сеть с timeline действий и
  маскированием секретов.
- Скриншоты (`captureVisibleTab`) с аннотациями и in-page редактором.
- Запись экрана (`getDisplayMedia` в offscreen; микрофон — через вкладку-рекордер)
  с экспортом в WebM / GIF (локальный кодировщик, без внешней сети).
- Детектор дефектов и snapshot-diff.
- Эмуляция окружения: UA / geo / timezone / language (session-rules DNR + MAIN-инъекция).

### Agent Handoff

- Отправка баг-репорта в Claude Code / Cursor / Codex одной кнопкой
  (deep link → файл через File System Access → буфер), без стороннего софта.

### Качество и доставка

- Тестовый харнес: Vitest + покрытие (v8), Playwright e2e, axe/vitest-axe (a11y).
- QA-гейт (typecheck → lint → format:check → test:coverage → build) и commitlint.
- CI/CD: GitHub Actions (ci / e2e / release), changesets для версий и CHANGELOG,
  Dependabot. Релиз отдаёт подписываемый zip + draft-ноты для Chrome Web Store.

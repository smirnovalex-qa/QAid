# QAid

Local-first набор QA-инструментов в одном расширении Chrome (Manifest V3): генераторы
тест-данных, декодеры, инспекторы. Ядро работает офлайн и не делает сетевых вызовов
(см. [docs/DECISIONS.md](docs/DECISIONS.md), ADR-0007).

> Статус: 🟢 в активной разработке. Реализованы ~20 инструментов (генераторы,
> декодеры, инспекторы, мок сети, редактор storage/cookies, профили сессий,
> запись экрана/скриншоты, экспорт бага, Agent Handoff); 1905 юнит-тестов, 94 ADR.
> Публичного релиза/тега пока нет.

## Возможности

- **Генерация тест-данных** — случайные числа и строки, timestamp / хэши / UUID,
  автозаполнение форм тест-данными с аудитом.
- **Декодеры** — JWT, Base64, URL, JSON.
- **Инспекторы страницы** — контраст WCAG, палитра цветов, шрифты, линейка /
  отступы и «Инспектор элемента» (computed-профиль, matched CSS rules / каскад,
  живой режим курсором + навигация по DOM-иерархии).
- **Сеть** — мок запросов (панель/ответы, сценарии, троттлинг/офлайн, CDP-режим,
  replay с правками), подмена DOM.
- **Браузерные данные** — редактор storage / cookies / IndexedDB / Cache,
  профили сессий с hot-swap авторизации и опциональным шифрованием at-rest
  (WebCrypto), синк настроек между устройствами.
- **Фиксация багов** — экспорт «состояния бага» (URL + storage + консоль + сеть)
  с timeline действий, скриншоты с аннотациями и in-page редактором, запись
  экрана (WebM / GIF), детектор дефектов, snapshot-diff, эмуляция окружения
  (UA / geo / tz / lang).
- **Agent Handoff** — отправка баг-репорта в Claude Code / Cursor / Codex одной
  кнопкой (deep link → файл → буфер), без установки стороннего софта.
- **Три точки монтажа** — popup, side panel и перетаскиваемая плавающая панель
  поверх страницы.

Ядро работает офлайн и не делает сетевых вызовов (ADR-0007, см.
[docs/DECISIONS.md](docs/DECISIONS.md)).

## Требования

- Node **20 LTS** (см. [`.nvmrc`](.nvmrc)).
- **pnpm 9** (зафиксирован в `packageManager`). Быстрый способ включить: `corepack enable`.

## Установка

```bash
pnpm install
```

## Скрипты

| Команда                             | Действие                                             |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                          | Дев-сборка Vite + HMR (загрузка unpacked-расширения) |
| `pnpm build`                        | `tsc --noEmit` + прод-сборка в `dist/`               |
| `pnpm typecheck`                    | Проверка типов (`tsc --noEmit`)                      |
| `pnpm lint`                         | ESLint (0 предупреждений)                            |
| `pnpm lint:fix`                     | ESLint с автоправкой                                 |
| `pnpm format` / `pnpm format:check` | Prettier запись / проверка                           |
| `pnpm test`                         | Vitest + покрытие (гейт ≥ 80% на ядре)               |
| `pnpm test:watch`                   | Vitest в watch-режиме                                |
| `pnpm test:e2e`                     | Playwright на собранном расширении                   |
| `pnpm package`                      | Zip для Chrome Web Store                             |

## Загрузка расширения (unpacked)

1. `pnpm build` — собирает `dist/`.
2. Chrome → `chrome://extensions` → включить **Developer mode**.
3. **Load unpacked** → выбрать папку `dist/`.
4. Клик по иконке открывает **popup**; кнопка «Открыть side panel» открывает
   боковую панель (`chrome.sidePanel.open`, требует жеста пользователя).
5. Service worker логирует `[qaid] installed` (см. «service worker» в
   `chrome://extensions`).

Для разработки: `pnpm dev` даёт HMR для popup/side panel (@crxjs).

## Упаковка для Chrome Web Store

```bash
pnpm package
```

Собирает прод-версию и создаёт `dist-zip/qaid-<version>.zip` (без
source maps). Версия берётся из `package.json` (semver → `manifest.version`,
полный semver — в `version_name`). Права — минимальные (`storage`, `sidePanel`);
подробности в [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

## Структура

```
src/
├── platform/     адаптер WebExtensions API (ADR-0014)
├── background/   service worker + роутинг сообщений
├── content/      content-скрипты (ISOLATED world) + релей
├── page/         скрипт MAIN world (перехват fetch/XHR)
├── popup/        popup-UI (Preact)
├── sidepanel/    side panel UI
├── panel/        тело плавающей панели (iframe на extension-странице)
├── offscreen/    offscreen-документ (запись экрана, MediaRecorder)
├── features/     самодостаточные фичи (logic + ui + дескриптор)
├── shared/       messaging, storage, random, serialization…
├── ui/           дизайн-токены и компоненты
└── i18n/         каталоги локализации
```

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Лицензия

[Apache-2.0](LICENSE) (ядро open-core, ADR-0009).

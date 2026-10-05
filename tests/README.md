# Тестовый харнес и конвенции (TASK-011)

Инфраструктура тестов QA Toolbox: Vitest (unit/компонентные), Playwright (e2e
поверх собранного расширения), axe (a11y). Конфиги — в корне репозитория
(`vitest.config.ts`, `playwright.config.ts`), общие моки/фикстуры/сетап — здесь.

## Структура

```
tests/
├── setup/vitest.setup.ts     # глобальный setup unit-среды (jest-dom, chrome-мок, cleanup)
├── mocks/chrome.ts           # переиспользуемый stateful мок chrome.* (install/reset)
├── fixtures/                 # общие тест-данные (base64, jwt, json-errors, hash, tz-dst)
└── e2e/
    ├── fixtures/extension.ts # persistent context + extensionId + openPopup/openSidePanel
    ├── global-setup.ts       # проверка наличия сборки dist/
    ├── popup.spec.ts         # smoke + эталон e2e (декодеры)
    └── a11y.spec.ts          # axe на popup/side panel
```

## Расположение и именование

- **Unit/компонентные** — рядом с кодом: `src/**/__tests__/*.test.ts(x)`.
- **e2e** — `tests/e2e/*.spec.ts`.
- **Файлы:** `*.test.ts(x)` — unit, `*.spec.ts` — e2e. Смешивать нельзя: `vitest`
  включает только `*.test`/`*.spec` из `src/**` и исключает `tests/e2e/**`;
  Playwright запускает только `tests/e2e/*.spec.ts`.
- **Кейсы:** `describe('<модуль>')` + `it('...')` / `test('...')`.

## Принципы

- **AAA** (Arrange / Act / Assert): подготовка → действие → проверка.
- **Детерминизм.** Никаких реальных таймеров/сети/времени: инъекция `now`
  (напр. `decodeJwt(token, nowSeconds)`), фиксированные `RandomSource` в тестах
  генераторов. Никаких сетевых обращений — политика приватности PRD §6/§9.
- **Чистая логика.** `logic.ts` тестируется как чистые функции без рендера и
  моков (близко к 100% строк). `ui.tsx` — через Testing Library по ролям/лейблам
  и `user-event`, без доступа к внутреннему стейту.
- **Изоляция.** `chrome.storage.local` (мок) сбрасывается между тестами
  (`resetChromeMock` в setup) — тесты не протекают друг в друга.

## chrome.* мок (`mocks/chrome.ts`)

Минимальный, но **stateful**: `storage.local` держит реальный in-memory объект,
поэтому тесты, читающие сохранённую под-вкладку/настройки, работают end-to-end.
Методы `storage.local` — dual-mode (promise И callback: так их дёргает
`webextension-polyfill`). `installChromeMock()` ставит `globalThis.chrome`,
`resetChromeMock()` чистит стор и счётчики вызовов. Расширять по мере появления
новых используемых API, не добавляя неиспользуемое.

## Фикстуры (`fixtures/`)

Общие данные, переиспользуемые несколькими фичами. Каноничные фиче-специфичные
наборы допускается держать рядом с фичей (`src/features/<f>/__tests__/fixtures/`)
и реэкспортировать здесь для обнаружимости — так сделано для base64/jwt/json.

## Покрытие и пороги

`pnpm test` = `vitest run --coverage`; пороги — **реальный гейт** (падение ниже →
ненулевой exit). Общий floor ≥ 80% (канон PRD §12); чистая `logic.ts` — 95% по
строкам/функциям; разделяемое ядро `src/shared/**` — 88% по строкам. Branch-пороги
намеренно ниже (floor): остаток ветвления — защитные `?? default`/catch на
непроходимых путях, гонять их искусственно вредно (см. ADR-0018). Отчёт — в
`./coverage` (`text` + `html` + `lcov` + `json-summary`).

## Команды

| Команда              | Что делает                          |
| -------------------- | ----------------------------------- |
| `pnpm test`          | unit/компонентные + покрытие (гейт) |
| `pnpm test:watch`    | watch-режим                         |
| `pnpm test:coverage` | явный прогон с покрытием            |
| `pnpm test:ui`       | Vitest UI                           |
| `pnpm test:e2e`      | e2e (требует `pnpm build` заранее)  |
| `pnpm test:e2e:ui`   | e2e в UI-режиме Playwright          |

## e2e: запуск

```bash
pnpm build                                    # собрать расширение в dist/
pnpm exec playwright install --with-deps chromium   # один раз: браузер
pnpm test:e2e
```

MV3 service worker не поднимается в headless старой модели. Рабочий режим —
**headed** (в CI — под `xvfb-run`) либо новый headless (`E2E_HEADFUL=0`,
запускает `--headless=new`). `global-setup.ts` падает с подсказкой, если `dist/`
не собран.

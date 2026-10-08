# CONTRIBUTING — стандарты разработки QAid

Единые правила для всех исполнителей (людей и агентов). Соблюдение обязательно — это входит в Definition of Done каждой задачи.

---

## 1. Требования окружения

- Node 20 LTS (см. `.nvmrc`).
- pnpm (версия зафиксирована в `packageManager` поля `package.json`).
- Установка: `pnpm install`.

## 2. Команды (npm scripts)

| Команда | Действие |
|---|---|
| `pnpm dev` | Дев-сборка с HMR, загрузка unpacked |
| `pnpm build` | Прод-сборка в `dist/` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (0 warnings допускается только осознанно) |
| `pnpm format` | Prettier --write |
| `pnpm test` | Vitest + покрытие |
| `pnpm test:e2e` | Playwright на собранном расширении |
| `pnpm package` | Zip для Chrome Web Store |

## 3. Ветвление и коммиты

- Транковая модель: короткоживущие ветки от `main`.
- Имя ветки: `feat/TASK-006-random-numbers`, `chore/TASK-001-scaffold`, `fix/...`.
- **Conventional Commits** обязательны (проверяется commitlint):
  - `feat(random-numbers): add float generator`
  - `fix(storage): fallback to defaults on corrupt data`
  - `chore`, `docs`, `test`, `refactor`, `build`, `ci`, `perf`.
- Каждая задача = отдельная ветка + PR. Тело PR ссылается на `TASK-0XX` и перечисляет выполненные критерии приёмки.
- **Changeset** на изменения поведения (feat/fix/perf): `pnpm changeset` в PR (semver + описание). Версию/CHANGELOG собирает Version PR; процесс — в [RELEASING.md](../RELEASING.md).

## 4. Стиль кода

- TypeScript strict. `any` запрещён (`@typescript-eslint/no-explicit-any`); используем `unknown` + сужение.
- Именование: `camelCase` — переменные/функции, `PascalCase` — типы/компоненты, `SCREAMING_SNAKE` — константы модульного уровня.
- Экспорты именованные; default-экспорт только для точек входа Preact-компонентов страниц.
- Чистая логика (`logic.ts`) не импортирует Preact и Chrome API.
- Без «магических чисел» — именованные константы.
- Ошибки на границах — через `Result<T,E>`/типизированные исключения, не «глотать» `catch`.
- Комментарии — почему, а не что; публичные API снабжаются TSDoc.

## 5. Стили и UI

- Только CSS Modules + токены из `ui/tokens.css`. Никаких инлайновых цветов/размеров вне токенов.
- Обе темы (light/dark) обязательны для любого нового UI.
- Доступность: фокус-стили, корректные роли/ARIA, `aria-live` для тостов, навигация с клавиатуры. Контраст текста ≥ WCAG AA.

## 6. Тестирование

- Чистая логика: юнит-тесты на happy-path + edge-cases + adversarial input; целевое покрытие близко к 100%.
- Компоненты: Testing Library (поведение, не реализация).
- Критичные пользовательские сценарии: e2e (Playwright) на собранном расширении.
- Глобальный порог покрытия ≥ 80% (statements/branches/functions/lines) — гейт CI.
- Тесты детерминированы: случайность мокается/сидируется, время — через инъекцию таймера/`vi.useFakeTimers`.

## 7. Безопасность и приватность

- Ядро не делает сетевых вызовов (см. ADR-0007). PR, добавляющий `fetch`/`XHR` в ядро, отклоняется.
- Криптостойкая случайность (`crypto.getRandomValues`) во всех генераторах.
- Минимум прав в манифесте; любое новое право — с обоснованием в описании PR и записью в DECISIONS при необходимости.
- Никаких секретов в репозитории; секреты CI — только через GitHub Secrets.

## 8. Definition of Done (DoD) — общий чеклист

Задача считается выполненной, только если:

- [ ] Реализованы все пункты «Критериев приёмки» из файла задачи.
- [ ] `pnpm typecheck` — без ошибок.
- [ ] `pnpm lint` — без ошибок.
- [ ] `pnpm test` — зелёный, порог покрытия соблюдён.
- [ ] Где применимо — `pnpm test:e2e` зелёный.
- [ ] Обе темы и базовая доступность проверены (для UI).
- [ ] Обновлён внутренний журнал выполнения и статус задачи (ведутся вне этого репозитория).
- [ ] Значимые решения зафиксированы в [DECISIONS.md](./DECISIONS.md) (при наличии).
- [ ] Коммиты — Conventional Commits; PR ссылается на TASK-id.
- [ ] Публичные API снабжены TSDoc; документация актуализирована.

## 9. Ревью

- Каждый PR проходит проверки CI (typecheck, lint, test, build) — красный CI блокирует merge.
- Ревьюер проверяет соответствие критериям приёмки и DoD, а не только «работает ли».
- Squash-merge с осмысленным заголовком по Conventional Commits.

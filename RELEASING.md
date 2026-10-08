# RELEASING — релизный процесс и CI/CD

Процесс доставки QAid: проверки на PR, версионирование и выпуск
подписываемого zip для Chrome Web Store. Общие стандарты — в
[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md).

## Workflow'ы

| Файл                                                             | Триггер                    | Что делает                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml)           | PR + push `main`           | `quality`: install→typecheck→lint→format:check→test:coverage→build (+ артефакты coverage/dist); `commitlint`: проверка заголовков коммитов PR |
| [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml)         | PR + push `main`           | Playwright e2e поверх собранного расширения под `xvfb` (пока **не** required — см. ниже)                                                      |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) | push `main` / тег `v*.*.*` | `version`: Version PR через changesets; `release`: гейт→сборка→сверка версии→zip→**draft** Release                                            |

Все шаги опираются на npm-скрипты из TASK-001/002/011 (`build`, `typecheck`,
`lint`, `test:coverage`, `test:e2e`, `package`) — CI их только вызывает.

## Модель версии (единый источник — `package.json`)

Версия задаётся **только** в `package.json`. Манифест генерируется из неё при
сборке (`src/manifest.config.ts` → `version` нормализуется для Chrome,
`version_name` хранит полный semver, ADR-0019). Отдельного статичного
`manifest.json` нет — «синхронизации файлов» не требуется. CI сверяет
соответствие тег ↔ `package.json` ↔ собранный `dist/manifest.json`
(`scripts/check-version.mjs`); рассинхрон роняет релиз (в MV3 это = отклонение
в Chrome Web Store).

SemVer соответствует Conventional Commits: `fix/perf`→patch, `feat`→minor,
breaking→major.

## Процесс релиза

1. **В обычных PR** добавляйте changeset на изменения поведения:
   ```bash
   pnpm changeset
   ```
   (детали — в [.changeset/README.md](.changeset/README.md)).
2. После merge PR в `main` job `version` открывает **Version PR** «version
   packages»: `changeset version` поднимает `package.json.version`, агрегирует
   `CHANGELOG.md`, удаляет использованные changeset'ы.
3. **Merge Version PR** в `main`.
4. Поставьте тег на новую версию и запушьте:
   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push origin --tags
   ```
5. Тег запускает job `release`: полный гейт качества → `pnpm build` →
   `check-version` → `pnpm run package` (zip в `dist-zip/`) →
   `scripts/release-notes.mjs` → **draft** GitHub Release с вложенным
   `qaid-<version>.zip` и заметками (включая секцию _Chrome Web Store
   submission notes_ с правами и обоснованием).
6. Человек проверяет draft-релиз (артефакт, права) и публикует.

## Branch protection (настроить в GitHub Settings → Branches)

- `main` защищён: прямой push запрещён, изменения только через PR.
- **Required status checks:** `quality` и `commitlint` (из `ci.yml`).
  Требовать актуальности ветки с `main` перед merge.
- **e2e — временно НЕ required.** Job `e2e` гоняется на каждом PR, но не в
  списке обязательных проверок, пока стабилизируется в CI-среде (headed под
  xvfb). План: включить в required после серии стабильных прогонов.
- Линейная история: **squash-merge**; заголовок squash — валидный Conventional
  Commit (его проверит commitlint при следующих прогонах).
- Для командного режима — минимум 1 approving review.

## Секреты и безопасность поставки

- **Ядро CI секретов не требует** — всё локально/офлайн (ADR-0007, PRD §6/§9).
- Секреты появятся только для опциональной публикации в Chrome Web Store:
  `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` —
  хранить в **GitHub Encrypted Secrets**, использовать **только** в job `release`,
  не логировать. Не использовать `pull_request_target` с секретами для форков.
- `permissions:` минимальны: по умолчанию `contents: read`; повышение до
  `contents: write` (Release) и `pull-requests: write` (Version PR) — точечно на
  уровне job.
- **Supply chain:** actions закреплены по мажорным тегам; для более строгой
  фиксации допускается pin по SHA. `Dependabot`
  ([.github/dependabot.yml](.github/dependabot.yml)) еженедельно обновляет `npm`
  и `github-actions`. Полагаемся на GitHub secret scanning; секретов в репозитории
  нет.

## Chrome Web Store (вне текущего scope)

На старте пайплайн отдаёт готовый **zip + draft-ноты**. Фактический upload через
`chrome-webstore-upload` (с секретами выше) и подпись `.crx` — CWS пересобирает и
подписывает сам — подключаются позже отдельным шагом в job `release` (заготовка с
TODO уже присутствует в `release.yml`).

# Changesets

Версионирование и CHANGELOG ведутся через [changesets](https://github.com/changesets/changesets).

## Как добавить changeset

Каждый PR, меняющий **поведение** (feat/fix/perf) или совместимость, добавляет
changeset:

```bash
pnpm changeset
```

Команда спросит тип изменения (semver) и краткое описание, затем создаст файл
`.changeset/<name>.md`. Правила бампа (совпадают с Conventional Commits, TASK-002):

- `fix` / `perf` → **patch** (`0.1.0 → 0.1.1`)
- `feat` → **minor** (`0.1.0 → 0.2.0`)
- breaking change → **major** (`0.1.0 → 1.0.0`)

Чисто внутренние изменения (docs/test/chore/ci/refactor без влияния на артефакт)
changeset не требуют.

## Как выходит релиз

1. PR с changeset'ами вливается в `main`.
2. Workflow `release.yml` (job `version`) открывает **Version PR** «Version
   Packages»: `changeset version` поднимает `package.json.version`, агрегирует
   `CHANGELOG.md`, удаляет использованные changeset'ы.
3. Merge Version PR → тег `vX.Y.Z` (совпадает с новой версией).
4. Тег запускает `release.yml` (job `release`): сборка → сверка версии → zip →
   **draft** GitHub Release.

Версия расширения синхронизируется автоматически: манифест генерируется из
`package.json` (ADR-0019), CI сверяет соответствие (`scripts/check-version.mjs`).
См. [RELEASING.md](../RELEASING.md).

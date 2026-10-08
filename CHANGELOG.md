# qaid

Журнал изменений ведётся автоматически через [changesets](https://github.com/changesets/changesets).
Новые версии добавляются сверху при выпуске Version PR (см. [RELEASING.md](./RELEASING.md)).

## 0.1.0

### Первая волна (каркас + утилиты + фичи)

- Каркас MV3-расширения: Vite + @crxjs, TypeScript strict, Preact + signals.
- Ядро: федеративный протокол сообщений, дескриптор фич, мост сред, слой настроек.
- Дизайн-система и UI-shell; общие UI-утилиты (copy/toast/export/validation).
- Фичи: генераторы чисел и строк, декодеры (JWT/Base64/URL/JSON), timestamp/хеши/UUID.
- Качество: тестовый харнес (Vitest + Playwright + axe) и QA-гейты; CI/CD-пайплайн.

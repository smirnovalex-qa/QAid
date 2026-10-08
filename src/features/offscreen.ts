/**
 * Барель offscreen-вкладов фич (offscreen-документ) — расцепление UI/offscreen
 * барелей (ADR-0047, по образцу `@/features/background` из F6 TASK-046).
 *
 * Импортирует ТОЛЬКО offscreen-сторону фич: модули, которые регистрируют свой
 * bootstrap в generic-реестре (`registerOffscreen`). Не тянет ни одного
 * `index.ts`-дескриптора, `ui.tsx`, i18n-каталога или чужой фичи — в отличие от
 * UI-барели `@/features`, которая жадно регистрирует все 21 фичу (дескриптор +
 * сообщения + оба i18n ≈ 307 КБ eager). Offscreen-документ эфемерный и выполняет
 * лишь bootstrap записи экрана, поэтому его точка входа (`src/offscreen/index.ts`)
 * импортирует этот узкий барель вместо полного.
 *
 * Инвариант расширяемости (ARCHITECTURE §1, §13): фича, которой нужен
 * offscreen-контекст, добавляется сюда одной строкой импорта её offscreen-модуля;
 * ядро (`src/offscreen/index.ts`) и generic-реестр (`src/offscreen/registry.ts`)
 * при этом не редактируются. Относительные импорты (`./x/offscreen`) сознательны —
 * как в UI-бареле `./index.ts` и background-бареле `./x/background`: они не нарушают
 * fitness-инвариант §12.1 «никто вне фичи не импортирует `@/features/<x>`», потому
 * что этот файл сам живёт внутри `features/` и является core-точкой агрегации
 * (наряду с `registry`/`background`, разрешён в fitness-тесте 1).
 */

// — Модули offscreen-bootstrap'ов (каждый side-effect'ом делает registerOffscreen) —
import './screen-recording/offscreen'; // запись экрана без микрофона (TASK-037, ADR-0045)

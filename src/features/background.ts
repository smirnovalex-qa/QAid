/**
 * Барель фоновых вкладов фич (service worker) — расцепление UI/background барелей
 * (F6 TASK-046, ADR-0047).
 *
 * Импортирует ТОЛЬКО SW-сторону фич: background-хендлеры и контракты сообщений. Не
 * тянет ни одного `ui.tsx`/preact/render-кода (в отличие от UI-барели `@/features`).
 * Импортирует лишь service worker (`background/index.ts`), поэтому граф popup/sidepanel
 * остаётся без фонового кода (перехватчики, DNR/CDP, replay-sender, cookies,
 * offscreen-оркестрация), а SW-чанк — без тел фич.
 *
 * SW обязан знать ВЕСЬ протокол сообщений (federated contracts, ARCHITECTURE §5): роутер
 * валидирует любое входящее сообщение по `type`, а `installInspectionForwarding()`
 * перечисляет `contentMessageTypes()`. Поэтому здесь регистрируются все контракты — и
 * background-адресованные (через модули хендлеров, которые импортируют свой `./messages`),
 * и content-адресованные (явными side-effect импортами модулей контрактов).
 *
 * Инвариант расширяемости (ARCHITECTURE §1, §13): добавление фичи с фоновыми хендлерами
 * — одна строка импорта её `background`-модуля + одна `registerBackground(...)` здесь;
 * ядро (`background/index.ts`) при этом не редактируется. Относительные импорты (`./x/…`)
 * сознательны — как в UI-бареле `./index.ts`: они не нарушают fitness-инвариант §12.1
 * «никто вне фичи не импортирует `@/features/<x>`».
 */
import { registerBackground } from './registry';

// — Модули фоновых хендлеров (каждый транзитивно регистрирует свои `./messages`) —
import { mockNetworkBackgroundHandlers } from './mock-network/background';
import { environmentBackgroundHandlers } from './environment/background';
import { bugReportBackgroundHandlers } from './bug-report/background';
import { screenRecordingHandlers } from './screen-recording/background';
// Cookies-хендлеры фичи storage-editor живут в общем инспекционном слое; импорт
// транзитивно регистрирует и storage/cookies-контракты (`./messages` внутри cookies.ts).
import { cookieBackgroundHandlers } from '@/shared/inspection/storage/cookies';

// — Контракты сообщений без background-хендлеров (content-форвардинг/потребление) —
// SW должен их знать для валидации в роутере и генерического форвардинга в вкладку.
import './screen-recording/messages'; // screen-recording/background не импортирует свой ./messages
import '@/shared/inspection/messages'; // inspection/* (probe/contrast/palette/fonts/ruler/defects/snapshot)
import '@/shared/inspection/idb/messages';
import '@/shared/inspection/cache/messages';
import '@/shared/inspection/forms/messages';
import '@/shared/inspection/dom-override/messages';
import '@/shared/inspection/screenshot/messages';

registerBackground('mock-network', mockNetworkBackgroundHandlers);
registerBackground('environment', environmentBackgroundHandlers);
registerBackground('bug-report', bugReportBackgroundHandlers);
registerBackground('screen-recording', screenRecordingHandlers);
registerBackground('storage-editor', cookieBackgroundHandlers);

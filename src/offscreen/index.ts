/**
 * Точка входа offscreen-документа (TASK-037, ADR-0045).
 *
 * Генерическая, как service worker (`background/index.ts`): импортирует УЗКИЙ барель
 * offscreen-вкладов фич (side-effect — фичи регистрируют свои offscreen-bootstrap'ы) и
 * запускает их из реестра. Конкретные фичи здесь НЕ упоминаются (инвариант
 * расширяемости, ARCHITECTURE §1; fitness §12.1). Документ невидимый, без UI —
 * управляется по `BroadcastChannel` из side panel.
 *
 * Берётся `@/features/offscreen`, а НЕ полный UI-барель `@/features`: последний жадно
 * регистрирует все 21 фичу (дескрипторы + сообщения + оба i18n ≈ 307 КБ eager), из
 * которых offscreen-документу не нужно ничего, кроме bootstrap записи экрана. Узкий
 * барель — по образцу SW-барели `@/features/background` (ADR-0047).
 */
import '@/features/offscreen'; // узкий барель (side-effect: offscreen-bootstrap'ы в реестре)
import { bootOffscreen } from './registry';

bootOffscreen();

/**
 * Точка входа offscreen-документа (TASK-037, ADR-0045).
 *
 * Генерическая, как service worker (`background/index.ts`): импортирует барель
 * саморегистрации фич (side-effect — фичи регистрируют свои offscreen-bootstrap'ы) и
 * запускает их из реестра. Конкретные фичи здесь НЕ упоминаются (инвариант
 * расширяемости, ARCHITECTURE §1; fitness §12.1). Документ невидимый, без UI —
 * управляется по `BroadcastChannel` из side panel.
 */
import '@/features'; // барель саморегистрации (side-effect: offscreen-bootstrap'ы в реестре)
import { bootOffscreen } from './registry';

bootOffscreen();

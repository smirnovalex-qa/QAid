/**
 * Service worker (MV3) — точка входа расширения.
 *
 * Подключает вклады фич генерически из реестра фоновых вкладов (ADR-0011/0047):
 * background итерирует зарегистрированные хендлеры и ставит их, затем поднимает
 * роутер. Конкретные фичи здесь не упоминаются (инвариант расширяемости,
 * ARCHITECTURE §1).
 *
 * Импортируется ТОЛЬКО background-барель (`@/features/background`), а не UI-барель
 * `@/features`: SW не тянет ни одного `ui.tsx` (тела фич лениво грузятся в оболочке).
 * Барель регистрирует и фоновые хендлеры, и весь протокол сообщений (роутер валидирует
 * входящее по `type`, форвардинг перечисляет content-контракты) — F2/F6 TASK-046.
 *
 * SW эфемерен: реестр хендлеров и роутер регистрируются в top-level модуля при
 * каждом старте worker'а — иначе первое сообщение после пробуждения не найдёт
 * хендлер.
 */
import '@/features/background'; // барель фоновых вкладов (side-effect: хендлеры + контракты)
import '@/shared/panel/messages'; // side-effect: контракт floating-panel/open в реестре SW
import { allBackgroundHandlers } from '@/features/registry';
import { installRouter, registerHandler } from '@/shared/messaging/bus';
import { installInspectionForwarding } from './inspection';
import { floatingPanelBackgroundHandlers } from './panel';
import { browser, sidePanel } from '@/platform';
import { logger } from '@/shared/logger';

for (const h of allBackgroundHandlers()) {
  registerHandler(h.type as never, h.handler as never);
}
// Инъектор откреплённой плавающей панели (TASK-062): `floating-panel/open` —
// background-адресованный хендлер (инъекция content-обёртки по жесту), поэтому
// регистрируется напрямую, не через генерический content-форвардинг ниже.
for (const h of floatingPanelBackgroundHandlers) {
  registerHandler(h.type as never, h.handler as never);
}
// Генерический форвардинг content-адресованных сообщений (инспекционный слой,
// TASK-013): background не держит для них доменных хендлеров — гарантирует
// инъекцию и пересылает в целевую вкладку. Конкретные фичи здесь не упоминаются.
installInspectionForwarding();
installRouter();

browser.runtime.onInstalled.addListener(() => {
  logger.info('installed');
});

// При заданном default_popup клик по иконке открывает popup; side panel
// открывается программно из popup (пользовательский жест). Поэтому поведение
// открытия по клику на action отключено.
void sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error: unknown) => {
  logger.error('sidePanel.setPanelBehavior', error);
});

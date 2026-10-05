/**
 * Менеджер инъекции и маршрутизатор инспекционного RPC в background (TASK-013).
 *
 * С TASK-062 общая механика инъекции вынесена в `background/inject.ts` (обобщена по
 * имени бандла + типу ping'а); здесь остаётся инспекционная СПЕЦИАЛИЗАЦИЯ: имя
 * `content-inspection.js`, ping `inspection/ping`, и генерический форвардинг
 * content-адресованных контрактов в целевую вкладку. Публичный API (`ensureContentScript`,
 * `forwardToContent`, `installInspectionForwarding`, `InspectionDeps`, `ScriptingSeam`)
 * сохранён без изменений — поведение и тесты прежние.
 *
 * Поток запроса: UI → runtime → background-роутер → форвардинг-хендлер (здесь) →
 * `ensureContentScript(tabId)` → `chrome.tabs.sendMessage(tabId, envelope)` →
 * content-хост. Ответ идёт обратной цепочкой; корреляция — в конверте.
 */
import type { Result } from '@/shared/result';
import { registerHandler } from '@/shared/messaging/bus';
import { contentMessageTypes } from '@/shared/messaging/registry';
import { InspectionPing } from '@/shared/inspection/messages';
import {
  ensureContentScript as injectEnsureContentScript,
  forwardToContent as injectForwardToContent,
} from './inject';
import type { ContentScriptSpec, InjectDeps, ScriptingSeam } from './inject';

/**
 * Стабильное имя собранного бандла content-хоста инспекции в `dist/`. Собирается
 * отдельным самодостаточным IIFE (`scripts/build-content.mjs`, ADR-0020), т.к.
 * `scripting.executeScript({ files })` грузит файл как классический (не-module)
 * скрипт. Имя обязано совпадать с выходом того скрипта.
 */
export const INSPECTION_CONTENT_SCRIPT = 'content-inspection.js';

/** Спецификация инъекции инспекционного хоста: имя бандла + ping живости. */
const INSPECTION_SPEC: ContentScriptSpec = {
  file: INSPECTION_CONTENT_SCRIPT,
  pingType: InspectionPing.type,
};

/** Зависимости инспекционного менеджера (seam инъекции/транспорта) — совпадают с {@link InjectDeps}. */
export type InspectionDeps = InjectDeps;
export type { ScriptingSeam };

/**
 * Гарантирует наличие инспекционного content-хоста в вкладке (проба живости
 * `inspection/ping` → при отсутствии — инъекция `content-inspection.js`). Ошибки —
 * типизированный `AppError` с `messageKey`, без исключений наружу.
 */
export function ensureContentScript(
  tabId: number,
  deps: InspectionDeps = {},
): Promise<Result<void>> {
  return injectEnsureContentScript(tabId, INSPECTION_SPEC, deps);
}

/**
 * Гарантирует инъекцию и пересылает валидированный запрос в целевую вкладку,
 * возвращая её ответ (payload). Ошибки — типизированный `AppErrorException`.
 */
export function forwardToContent(
  type: string,
  req: { tabId: number },
  deps: InspectionDeps = {},
): Promise<unknown> {
  return injectForwardToContent(type, req, INSPECTION_SPEC, deps);
}

/**
 * Регистрирует генерические форвардинг-хендлеры для всех content-адресованных
 * типов (`target: 'content'`), кроме внутренней пробы `inspection/ping`. Конкретные
 * фичи здесь не упоминаются — набор типов берётся из реестра сообщений.
 */
export function installInspectionForwarding(deps: InspectionDeps = {}): void {
  for (const type of contentMessageTypes()) {
    if (type === InspectionPing.type) continue;
    registerHandler(
      type as never,
      ((req: { tabId: number }) => forwardToContent(type, req, deps)) as never,
    );
  }
}

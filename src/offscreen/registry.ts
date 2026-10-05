/**
 * Реестр bootstrap-ов offscreen-документа — генерическая точка расширения (как барель
 * `@/features` для service worker'а). Фича, которой нужен offscreen-контекст (напр.
 * запись экрана, TASK-037/ADR-0045), регистрирует здесь свой bootstrap; входная точка
 * `src/offscreen/index.ts` вызывает их все. Ядро/точка входа НЕ знают о конкретных
 * фичах (инвариант расширяемости, ARCHITECTURE §1, fitness §12.1).
 *
 * Регистрация (push в массив) идемпотентно безопасна в любом контексте; сам bootstrap
 * (создание `BroadcastChannel` и т.п.) исполняется ТОЛЬКО из `bootOffscreen()`, т.е.
 * лишь внутри offscreen-документа, а не при импорте фичи в SW/UI.
 */

/** Функция инициализации фичи в offscreen-контексте (без аргументов, side-effect). */
export type OffscreenBootstrap = () => void;

const bootstraps: OffscreenBootstrap[] = [];

/** Регистрирует bootstrap фичи (side-effect импорта её offscreen-модуля). */
export function registerOffscreen(boot: OffscreenBootstrap): void {
  bootstraps.push(boot);
}

/** Запускает все зарегистрированные bootstrap-ы (вызывается точкой входа offscreen). */
export function bootOffscreen(): void {
  for (const boot of bootstraps) boot();
}

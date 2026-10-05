/**
 * Типизированная cross-feature шина событий (ADR-0015).
 *
 * Фичи обмениваются данными не через прямые импорты друг друга, а через pub/sub.
 * Интерфейс `AppEvents` открыт для расширения через declaration merging (как
 * `MessageContracts`): фича объявляет свои события в собственном модуле, не
 * редактируя ядро. Пример: `presets:dataset:changed`.
 */

// Пустой by design — расширяется фичами через declaration merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppEvents {}

type Listener<T> = (payload: T) => void;

const listeners = new Map<string, Set<Listener<unknown>>>();

/** Публикует событие всем текущим подписчикам синхронно. */
export function emit<K extends Extract<keyof AppEvents, string>>(
  type: K,
  payload: AppEvents[K],
): void {
  const set = listeners.get(type);
  if (!set) return;
  // Копия на момент публикации: подписчик может отписаться в обработчике.
  for (const cb of [...set]) cb(payload);
}

/** Подписывает обработчик; возвращает функцию отписки. */
export function on<K extends Extract<keyof AppEvents, string>>(
  type: K,
  cb: Listener<AppEvents[K]>,
): () => void {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  const listener = cb as Listener<unknown>;
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

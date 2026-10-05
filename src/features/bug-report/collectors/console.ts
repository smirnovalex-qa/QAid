/**
 * MAIN-world кольцевой буфер консоли (TASK-025, TASK-013).
 *
 * Перехватывает `console.error`/`console.warn` + глобальные `error`/
 * `unhandledrejection` в кольцевой буфер последних N сообщений на `window`.
 * Инъектируется через `executeScript({ world:'MAIN', func })` — Chrome сериализует
 * функцию как `func.toString()` БЕЗ замыкания модуля, поэтому каждая функция ОБЯЗАНА
 * быть самодостаточной: литерал ключа стора и все хелперы объявлены ВНУТРИ тела
 * (ADR-0028). Ссылка на константу уровня модуля стала бы свободной и упала
 * ReferenceError на странице; регрессию ловит `__tests__/serialization.test.ts`.
 *
 * Приватность: перехваченный текст НЕ покидает страницу иначе как в снимок буфера,
 * который забирает только наша панель по запросу (`bugReport/consoleRead`). Буфер
 * снимается и забывается по `clearConsoleBuffer` (teardown возвращает исходные
 * методы консоли и снимает слушатели).
 */
import type { ConsoleEntry } from '../types';

/** Форма стора на `window` (живёт между чтениями одной сессии страницы). */
interface ConsoleStore {
  installed: true;
  cap: number;
  log: ConsoleEntry[];
  origError: typeof console.error;
  origWarn: typeof console.warn;
  onError: (event: Event) => void;
  onRejection: (event: Event) => void;
}

/**
 * Устанавливает (или переустанавливает) кольцевой буфер. Идемпотентно: если стор
 * уже стоит — обновляем только `cap` (без повторного оборачивания console/слушателей).
 */
export function installConsoleBuffer(cap: number): void {
  // ВАЖНО (ADR-0028): литерал ключа объявлен ВНУТРИ функции — тело сериализуется в
  // MAIN-world через `func.toString()` без замыкания модуля.
  const STORE_KEY = '__qatbConsole__';
  const win = window as unknown as Record<string, ConsoleStore | undefined>;
  const existing = win[STORE_KEY];
  if (existing) {
    existing.cap = cap;
    return;
  }

  // — Инлайновые хелперы (самодостаточны) —
  const stringifyArg = (arg: unknown): string => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return '[unserializable object]';
      }
    }
    if (typeof arg === 'symbol') return arg.toString();
    if (typeof arg === 'function') return `[function ${arg.name}]`;
    // Осталось только примитивы (number/boolean/bigint/null/undefined) — String безопасен.
    return String(arg);
  };

  const stringifyArgs = (args: unknown[]): string => args.map(stringifyArg).join(' ');

  const store: ConsoleStore = {
    installed: true,
    cap,
    log: [],
    origError: console.error,
    origWarn: console.warn,
    onError: () => undefined,
    onRejection: () => undefined,
  };

  const push = (
    level: ConsoleEntry['level'],
    source: ConsoleEntry['source'],
    text: string,
  ): void => {
    store.log.push({ level, source, text, at: Date.now() });
    if (store.log.length > store.cap) store.log.splice(0, store.log.length - store.cap);
  };

  console.error = function patchedError(...args: unknown[]): void {
    push('error', 'console', stringifyArgs(args));
    store.origError.apply(console, args);
  };
  console.warn = function patchedWarn(...args: unknown[]): void {
    push('warn', 'console', stringifyArgs(args));
    store.origWarn.apply(console, args);
  };

  store.onError = (event: Event): void => {
    const e = event as ErrorEvent;
    const err: unknown = e.error;
    const text = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : e.message;
    push('error', 'onerror', text);
  };
  store.onRejection = (event: Event): void => {
    const reason: unknown = (event as PromiseRejectionEvent).reason;
    const text =
      reason instanceof Error
        ? (reason.stack ?? `${reason.name}: ${reason.message}`)
        : stringifyArg(reason);
    push('error', 'unhandledrejection', text);
  };

  window.addEventListener('error', store.onError, true);
  window.addEventListener('unhandledrejection', store.onRejection, true);

  win[STORE_KEY] = store;
}

/** Возвращает снимок кольцевого буфера (пустой массив, если буфер не установлен). */
export function readConsoleBuffer(): ConsoleEntry[] {
  const STORE_KEY = '__qatbConsole__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, ConsoleStore | undefined>;
  const store = win[STORE_KEY];
  return store ? [...store.log] : [];
}

/** Снимает перехват (возвращает console.error/warn и слушатели) и забывает буфер. No-op, если не стоял. */
export function clearConsoleBuffer(): void {
  const STORE_KEY = '__qatbConsole__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, ConsoleStore | undefined>;
  const store = win[STORE_KEY];
  if (!store) return;
  console.error = store.origError;
  console.warn = store.origWarn;
  window.removeEventListener('error', store.onError, true);
  window.removeEventListener('unhandledrejection', store.onRejection, true);
  win[STORE_KEY] = undefined;
}

/**
 * Глобальная настройка unit/компонентной среды Vitest (TASK-011 §3).
 *
 * Порядок важен: мок `chrome.*` ставится синхронно на верхнем уровне модуля —
 * `webextension-polyfill` при импорте (транзитивно через `src/platform`) требует
 * `chrome.runtime.id`, а setup-файлы исполняются до тест-модулей.
 *
 * - `@testing-library/jest-dom/vitest` — DOM-матчеры;
 * - `afterEach(cleanup)` — размонтирование Preact-деревьев между тестами;
 * - `resetChromeMock()` в `afterEach` — изоляция: чистый `storage.local` и
 *   сброшенные счётчики вызовов на каждый тест;
 * - полифиллы `matchMedia` (jsdom не реализует) и `crypto.subtle`/`randomUUID`
 *   (на случай среды без Web Crypto) — иначе тесты темы и timestamp-hash падают.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';
import { installChromeMock, resetChromeMock } from '../mocks/chrome';

installChromeMock();

afterEach(() => {
  cleanup();
  resetChromeMock();
});

// jsdom не реализует matchMedia; дефолт — «светлая» тема, тесты темы переопределяют.
type MatchMediaFn = (query: string) => MediaQueryList;
const globalWithMedia = globalThis as typeof globalThis & { matchMedia?: MatchMediaFn };
if (typeof globalWithMedia.matchMedia !== 'function') {
  globalWithMedia.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom не реализует Canvas 2D — `getContext` БРОСАЕТ «Not implemented» (а не
// возвращает null). UI скриншота это уже переживает (`ctx === null` → пропуск
// отрисовки), но брошенная ошибка всплывает асинхронно и делает полный прогон
// флапающим (иногда приписывается чужому файлу). Возвращаем null детерминированно.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// jsdom не реализует Pointer Events: нет конструктора `PointerEvent`, нет IDL-атрибутов
// `onpointer*` на элементах и нет `setPointerCapture`. Из-за отсутствия `onpointerdown`
// в элементе Preact вешает слушатель под CamelCase-именем ('PointerDown'), и обычный
// `fireEvent.pointerDown` до него не доходит. Полифиллим минимум, чтобы pointer-driven
// UI (холст скриншота) тестировался штатно, как в браузере.
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventPolyfill;
}
if (typeof HTMLElement !== 'undefined') {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  for (const name of ['onpointerdown', 'onpointermove', 'onpointerup', 'onpointerleave']) {
    if (!(name in proto)) proto[name] = null; // делает `name in el` истинным → Preact лоуэркейсит
  }
  const el = Element.prototype as unknown as Record<string, unknown>;
  el.setPointerCapture ??= (): void => undefined;
  el.releasePointerCapture ??= (): void => undefined;
  el.hasPointerCapture ??= (): boolean => false;
}

// Web Crypto: в Node 20+ доступен через globalThis.crypto; подстраховка на случай
// среды без него (crypto.subtle нужен hash-инструментам timestamp-hash).
async function ensureWebCrypto(): Promise<void> {
  const g = globalThis as typeof globalThis & { crypto?: Crypto };
  if (g.crypto?.subtle && typeof g.crypto.randomUUID === 'function') return;
  const { webcrypto } = await import('node:crypto');
  g.crypto = webcrypto as unknown as Crypto;
}
await ensureWebCrypto();

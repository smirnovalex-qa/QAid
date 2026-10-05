/**
 * Переиспользуемый element picker инспекционного слоя (TASK-013).
 *
 * Режим выбора: подсветка элемента под курсором (через колбэк `onHover`), выбор
 * по клику, отмена по `Esc`. Слушатели вешаются в фазе перехвата на `document`,
 * поэтому клик перехватывается до обработчиков страницы. По завершении состояние
 * страницы полностью восстанавливается (слушатели сняты, курсор возвращён).
 *
 * Осознанно используется `event.target`, а не `elementFromPoint`: это работает и
 * в jsdom, и когда оверлей поверх страницы имеет `pointer-events: none`.
 *
 * Модуль независим от `overlay.ts` — хост связывает их через `onHover`.
 */

/**
 * Селекторы собственных UI-хостов расширения — события над ними игнорируются (оверлей
 * инспектора и откреплённая плавающая панель, TASK-062). Единый источник — `dom.ts`.
 */
import { IGNORED_UI_SELECTOR } from '@/shared/inspection/dom';

export interface StartPickerOptions {
  document?: Document;
  /** Вызывается при наведении с элементом под курсором (для подсветки). */
  onHover?: (el: Element) => void;
  /**
   * Внешняя отмена. При `abort` пикер снимает слушатели, восстанавливает курсор и
   * резолвится `null` — так хост может прервать «висячий» выбор (новый `pick`,
   * `teardown`, `pagehide`), не оставляя перехватчиков кликов на странице.
   */
  signal?: AbortSignal;
}

/**
 * Запускает режим выбора: подсветка под курсором, выбор по клику, `Esc` — отмена.
 * Возвращает выбранный `Element` или `null` (отмена/прерывание). Блокирует
 * клик-сквозь на время выбора и полностью восстанавливает состояние страницы после
 * — при любом исходе (клик, `Esc`, `abort`), чтобы страница/инструмент не «залипали».
 */
export function startPicker(options: StartPickerOptions = {}): Promise<Element | null> {
  const doc = options.document ?? document;
  const root = doc.documentElement;
  const onHover = options.onHover;
  const signal = options.signal;

  return new Promise<Element | null>((resolve) => {
    // Уже отменён до старта — ничего не вешаем.
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    let settled = false;
    const previousCursor = root.style.cursor;

    const finish = (result: Element | null): void => {
      if (settled) return;
      settled = true;
      doc.removeEventListener('mousemove', onMouseMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      signal?.removeEventListener('abort', onAbort);
      root.style.cursor = previousCursor;
      resolve(result);
    };

    const targetElement = (event: Event): Element | null => {
      const target = event.target;
      if (!(target instanceof Element)) return null;
      if (target.closest(IGNORED_UI_SELECTOR)) return null;
      return target;
    };

    function onMouseMove(event: Event): void {
      const el = targetElement(event);
      if (el) onHover?.(el);
    }

    function onClick(event: Event): void {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      finish(targetElement(event));
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    }

    function onAbort(): void {
      finish(null);
    }

    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKeyDown, true);
    signal?.addEventListener('abort', onAbort);
    root.style.cursor = 'crosshair';
  });
}

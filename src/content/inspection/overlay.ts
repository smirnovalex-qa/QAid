/**
 * Оверлей инспекционного слоя (TASK-013) — хост в закрытом Shadow DOM.
 *
 * ADR: оверлей рисуется поверх страницы, но НЕ мутирует её DOM/стили. Контейнер
 * и подсветка живут в `attachShadow({ mode: 'closed' })`, стили — только инлайн
 * (CSP-безопасно: без внешних ресурсов, `<link>` и `eval`). Клики по умолчанию
 * проходят сквозь оверлей (`pointer-events: none`), чтобы пикер видел реальный
 * элемент под курсором.
 *
 * Два бокса подсветки (TASK-056): `locked` — выбранный («заякоренный») узел, тот же
 * стиль, что и раньше (сплошная рамка); `hover` — элемент под курсором в живом режиме
 * (пунктир, легче). Оба живут в одном закрытом shadow root, поэтому могут быть видны
 * одновременно (осмотренный узел + наведение).
 */
import type { ElementRect } from '@/shared/inspection/types';

/** Максимальный z-index — оверлей поверх любого содержимого страницы. */
const MAX_Z_INDEX = '2147483647';

/** Data-атрибут хоста: по нему пикер/обходчики DOM исключают сам оверлей. */
export const OVERLAY_HOST_ATTR = 'data-qatb-overlay';

/**
 * Вариант бокса подсветки: `locked` — выбранный узел (сплошная рамка), `hover` —
 * элемент под курсором в живом режиме (пунктир). См. {@link Overlay.highlight}.
 */
export type OverlayVariant = 'locked' | 'hover';

export interface Overlay {
  /** Контейнер, добавленный в документ (носитель закрытого shadow root). */
  readonly host: HTMLElement;
  /**
   * Спозиционировать и показать бокс подсветки (`position: fixed`). Вариант по
   * умолчанию — `locked` (обратная совместимость: прежние вызовы `highlight(rect)`
   * рисуют тот же сплошной бокс выбранного узла).
   */
  highlight(rect: ElementRect | DOMRect, variant?: OverlayVariant): void;
  /**
   * Скрыть боксы: без аргумента — ОБА (прежние вызывающие ждут именно этого);
   * с вариантом — только указанный (напр. `clear('hover')` гасит наведение, оставляя
   * заякоренный бокс).
   */
  clear(variant?: OverlayVariant): void;
  /** Удалить хост из документа, полный teardown. Идемпотентно. */
  destroy(): void;
}

/** Инлайн-стили бокса на вариант (CSP-safe: без внешних ресурсов). */
const BOX_STYLE: Record<OverlayVariant, string> = {
  locked: `position: fixed; top: 0; left: 0; width: 0; height: 0; box-sizing: border-box; outline: 2px solid #2f81f7; outline-offset: -1px; background: rgba(47, 129, 247, 0.12); pointer-events: none; display: none; z-index: ${MAX_Z_INDEX};`,
  hover: `position: fixed; top: 0; left: 0; width: 0; height: 0; box-sizing: border-box; outline: 1px dashed #2f81f7; outline-offset: -1px; background: rgba(47, 129, 247, 0.06); pointer-events: none; display: none; z-index: ${MAX_Z_INDEX};`,
};

/**
 * Создаёт оверлей. По умолчанию работает с глобальным `document`; параметр `doc`
 * — для тестов и мульти-документных сценариев.
 */
export function createOverlay(doc: Document = document): Overlay {
  const host = doc.createElement('div');
  host.setAttribute(OVERLAY_HOST_ATTR, '');
  host.style.cssText = `position: fixed; inset: 0; margin: 0; padding: 0; border: 0; pointer-events: none; z-index: ${MAX_Z_INDEX};`;

  const shadow = host.attachShadow({ mode: 'closed' });

  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'all: initial;';

  const makeBox = (variant: OverlayVariant): HTMLDivElement => {
    const el = doc.createElement('div');
    el.style.cssText = BOX_STYLE[variant];
    wrapper.appendChild(el);
    return el;
  };

  const boxes: Record<OverlayVariant, HTMLDivElement> = {
    locked: makeBox('locked'),
    hover: makeBox('hover'),
  };

  shadow.appendChild(wrapper);
  doc.documentElement.appendChild(host);

  return {
    host,
    highlight(rect, variant = 'locked') {
      const box = boxes[variant];
      box.style.left = `${String(rect.x)}px`;
      box.style.top = `${String(rect.y)}px`;
      box.style.width = `${String(rect.width)}px`;
      box.style.height = `${String(rect.height)}px`;
      box.style.display = 'block';
    },
    clear(variant) {
      if (variant === undefined) {
        boxes.locked.style.display = 'none';
        boxes.hover.style.display = 'none';
        return;
      }
      boxes[variant].style.display = 'none';
    },
    destroy() {
      host.remove();
    },
  };
}

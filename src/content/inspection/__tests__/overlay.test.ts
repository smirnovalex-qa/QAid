import { afterEach, describe, expect, it } from 'vitest';
import { createOverlay, OVERLAY_HOST_ATTR } from '@/content/inspection/overlay';

/** Прямоугольник-заглушка (форма `ElementRect`) для позиционирования боксов. */
const RECT = { x: 10, y: 20, width: 30, height: 40 };

/**
 * Оверлей живёт в ЗАКРЫТОМ shadow root (`mode: 'closed'`) — его боксы недоступны из теста
 * (ни `host.shadowRoot`, ни обход внутрь). Поэтому проверяем НАБЛЮДАЕМЫЙ публичный контракт:
 * хост присоединён/отсоединён от документа и все пути `highlight`/`clear` по вариантам не
 * бросают и возвращают `void`. Реальную визуальную семантику двух боксов покрывает e2e.
 */
afterEach(() => {
  for (const node of Array.from(document.querySelectorAll(`[${OVERLAY_HOST_ATTR}]`))) {
    node.remove();
  }
});

describe('createOverlay', () => {
  it('присоединяет хост к документу и помечает его data-атрибутом', () => {
    const overlay = createOverlay();
    expect(overlay.host.hasAttribute(OVERLAY_HOST_ATTR)).toBe(true);
    expect(document.documentElement.contains(overlay.host)).toBe(true);
  });

  it('destroy() удаляет хост из документа', () => {
    const overlay = createOverlay();
    const { host } = overlay;
    overlay.destroy();
    expect(document.documentElement.contains(host)).toBe(false);
    expect(document.querySelector(`[${OVERLAY_HOST_ATTR}]`)).toBeNull();
  });

  it('destroy() идемпотентен (повторный вызов не бросает)', () => {
    const overlay = createOverlay();
    overlay.destroy();
    expect(() => {
      overlay.destroy();
    }).not.toThrow();
  });

  it('highlight() без варианта (locked по умолчанию) не бросает', () => {
    const overlay = createOverlay();
    expect(() => {
      overlay.highlight(RECT);
    }).not.toThrow();
  });

  it('highlight(rect, "hover") не бросает — второй бокс рисуется независимо', () => {
    const overlay = createOverlay();
    // Оба варианта можно показать одновременно (осмотренный узел + наведение).
    expect(() => {
      overlay.highlight(RECT, 'locked');
      overlay.highlight(RECT, 'hover');
    }).not.toThrow();
  });

  it('clear("hover") гасит только hover; clear() гасит оба — оба пути без исключений', () => {
    const overlay = createOverlay();
    overlay.highlight(RECT, 'locked');
    overlay.highlight(RECT, 'hover');
    expect(() => {
      overlay.clear('hover');
      overlay.clear('locked');
      overlay.clear();
    }).not.toThrow();
  });

  it('принимает DOMRect от getBoundingClientRect (не только ElementRect)', () => {
    const overlay = createOverlay();
    const el = document.createElement('div');
    expect(() => {
      overlay.highlight(el.getBoundingClientRect(), 'hover');
    }).not.toThrow();
  });
});

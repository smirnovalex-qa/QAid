import { afterEach, describe, expect, it } from 'vitest';
import { PANEL_HOST_ATTR, createPanelFrame } from '@/content/panel/frame';
import type { PanelFrameParts } from '@/content/panel/frame';

const labels = { collapse: 'Свернуть', expand: 'Развернуть', close: 'Закрыть' };

function make(): PanelFrameParts {
  return createPanelFrame({
    iframeSrc: 'chrome-extension://abc/src/panel/index.html#nonce-xyz',
    title: 'QAid',
    labels,
    width: 380,
    height: 560,
  });
}

function hostCount(): number {
  return document.querySelectorAll(`[${PANEL_HOST_ATTR}]`).length;
}

afterEach(() => {
  for (const node of Array.from(document.querySelectorAll(`[${PANEL_HOST_ATTR}]`))) node.remove();
});

describe('createPanelFrame', () => {
  it('монтирует closed-Shadow хост с [data-qatb-panel] и iframe на заданный src', () => {
    const f = make();
    expect(hostCount()).toBe(1);
    expect(f.host.getAttribute(PANEL_HOST_ATTR)).toBe('');
    // Закрытый shadow root недоступен снаружи — панель изолирована.
    expect(f.host.shadowRoot).toBeNull();
    expect(f.iframe.src).toContain('#nonce-xyz');
    expect(f.host.style.position).toBe('fixed');
  });

  it('setPosition пишет transform:translate3d', () => {
    const f = make();
    f.setPosition(120, 48);
    expect(f.host.style.transform).toBe('translate3d(120px, 48px, 0)');
  });

  it('setCollapsed скрывает тело и переключает подпись кнопки', () => {
    const f = make();
    f.setCollapsed(true);
    expect(f.body.style.display).toBe('none');
    expect(f.collapseBtn.getAttribute('aria-label')).toBe(labels.expand);
    f.setCollapsed(false);
    expect(f.body.style.display).toBe('block');
    expect(f.collapseBtn.getAttribute('aria-label')).toBe(labels.collapse);
  });

  it('setIframeInteractive гасит pointer-events iframe (для драга)', () => {
    const f = make();
    f.setIframeInteractive(false);
    expect(f.iframe.style.pointerEvents).toBe('none');
    f.setIframeInteractive(true);
    expect(f.iframe.style.pointerEvents).toBe('auto');
  });

  it('showFallback убирает iframe и рисует локализованное сообщение', () => {
    const f = make();
    f.showFallback('Панель заблокирована', 'CSP страницы запрещает фрейм.');
    expect(f.body.contains(f.iframe)).toBe(false);
    expect(f.body.textContent).toContain('Панель заблокирована');
    expect(f.body.textContent).toContain('CSP страницы запрещает фрейм.');
  });

  it('кнопки заголовка помечены data-no-drag (клик по ним не начинает drag)', () => {
    const f = make();
    expect(f.collapseBtn.hasAttribute('data-no-drag')).toBe(true);
    expect(f.closeBtn.hasAttribute('data-no-drag')).toBe(true);
  });

  it('destroy снимает хост с документа (идемпотентно)', () => {
    const f = make();
    expect(hostCount()).toBe(1);
    f.destroy();
    expect(hostCount()).toBe(0);
    f.destroy();
    expect(hostCount()).toBe(0);
  });
});

/**
 * DEV-ONLY превью откреплённой плавающей панели (TASK-062). Монтирует НАСТОЯЩУЮ
 * content-обёртку (`createPanelFrame`) с реальным перетаскиванием (`enableDrag` +
 * `clampPosition`) поверх демо-страницы, чтобы drag/clamp/collapse/close проверялись
 * ВИЗУАЛЬНО в light/dark без Load-unpacked. Тело панели здесь — placeholder (а не
 * cross-origin iframe на extension-страницу): реальную инъекцию+iframe+persist проверяет
 * e2e (`tests/e2e/floating-panel.spec.ts`). НЕ часть сборки расширения (только preview).
 *
 * См. [[inspector-preview-harness]], [[ui-ux-bar-verify-visually]].
 */
import { t } from '@/i18n';
import { PANEL_HEADER_HEIGHT, createPanelFrame } from '@/content/panel/frame';
import type { PanelFrameParts } from '@/content/panel/frame';
import { clampPosition, enableDrag } from '@/content/panel/drag';
import type { DragController } from '@/content/panel/drag';
import '@/content/panel/i18n';

const WIDTH = 380;
const HEIGHT = 520;
const MARGIN = 16;

/** Placeholder-тело вместо extension-iframe (preview не имеет origin расширения). */
function demoBody(): string {
  const html = `<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif">
    <div style="padding:16px;color:#3c4043">
      <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:#1f2430">QAnvil</div>
      <div style="font-size:13px;line-height:1.5">
        Демо тела плавающей панели. Тяните заголовок, чтобы перемещать; «–» — свернуть, «×» — закрыть.
        В расширении здесь рендерится реальная поверхность <code>QASurface variant="panel"</code>.
      </div>
    </div></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** Кнопка повторного запуска после закрытия панели. */
function launchButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = '＋ ' + t('shell.detach');
  btn.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:10px 14px;border:0;' +
    'border-radius:8px;background:#1f2430;color:#e8eaed;font:600 13px system-ui;cursor:pointer;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.3)';
  btn.addEventListener('click', onClick);
  document.body.appendChild(btn);
  return btn;
}

/** Монтирует демо плавающей панели (идемпотентно через модульный флаг). */
export function mountPanelDemo(): void {
  let frame: PanelFrameParts | null = null;
  let drag: DragController | null = null;
  let collapsed = false;
  let pos = { x: Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN), y: MARGIN };

  const mount = (): void => {
    frame = createPanelFrame({
      iframeSrc: demoBody(),
      title: t('panel.title'),
      labels: {
        collapse: t('panel.collapse'),
        expand: t('panel.expand'),
        close: t('panel.close'),
      },
      width: WIDTH,
      height: HEIGHT,
    });
    frame.setPosition(pos.x, pos.y);

    const clamp = (x: number, y: number): { x: number; y: number } =>
      clampPosition(
        x,
        y,
        { width: WIDTH, headerHeight: PANEL_HEADER_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight },
      );

    drag = enableDrag({
      handle: frame.handle,
      getPosition: () => pos,
      clamp,
      onMove: (x, y) => {
        pos = { x, y };
        frame?.setPosition(x, y);
      },
      onStart: () => frame?.setIframeInteractive(false),
      onEnd: (x, y) => {
        frame?.setIframeInteractive(true);
        pos = { x, y };
        frame?.setPosition(x, y);
      },
    });

    frame.collapseBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      frame?.setCollapsed(collapsed);
      const p = clamp(pos.x, pos.y);
      pos = p;
      frame?.setPosition(p.x, p.y);
    });
    frame.closeBtn.addEventListener('click', () => {
      drag?.destroy();
      frame?.destroy();
      frame = null;
      const btn = launchButton(() => {
        btn.remove();
        remount();
      });
    });
  };

  const remount = (): void => {
    collapsed = false;
    pos = { x: Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN), y: MARGIN };
    mount();
  };

  mount();
}

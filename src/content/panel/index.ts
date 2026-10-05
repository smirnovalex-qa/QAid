/**
 * Точка входа инъектируемой content-обёртки плавающей панели (ISOLATED world, TASK-062).
 *
 * Инъектируется по требованию фоновым инъектором (`background/panel.ts`) через
 * `chrome.scripting.executeScript({ files: ['content-panel.js'] })` (ADR-0020/0053,
 * least-privilege). Идемпотентность — guard-флаг `window.__qatb_panel__`: повторная
 * инъекция не плодит второй экземпляр, а разворачивает/поднимает существующую панель
 * (`window.__qatb_panel_reopen__`). При закрытии/`pagehide` guard сбрасывается, чтобы
 * следующий `floating-panel/open` снова смонтировал панель.
 *
 * В отличие от инспекционного хоста, обёртка НЕ поднимает `chrome.runtime`-роутер (нет
 * своих content-контрактов): тело панели (iframe — extension-контекст) общается с
 * background тем же bus, что popup/side panel.
 */
import { installPanelHost } from './host';

declare global {
  interface Window {
    __qatb_panel__?: boolean;
    __qatb_panel_reopen__?: () => void;
  }
}

if (window.__qatb_panel__) {
  // Уже смонтирована — повторное открытие разворачивает/поднимает её.
  window.__qatb_panel_reopen__?.();
} else {
  window.__qatb_panel__ = true;
  const host = installPanelHost({
    onDestroy: () => {
      // Любой путь teardown (кнопка «закрыть»/`pagehide`) сбрасывает guard и reopen-хук,
      // чтобы следующий `floating-panel/open` снова смонтировал панель.
      window.__qatb_panel__ = false;
      delete window.__qatb_panel_reopen__;
    },
  });
  window.__qatb_panel_reopen__ = (): void => {
    host.reopen();
  };
}

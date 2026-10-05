/**
 * Точка входа тела откреплённой плавающей панели (TASK-062). По образцу
 * `src/sidepanel/main.tsx`: тема + i18n + реестр фич + `QASurface variant="panel"`.
 * Дополнительно инициализирует {@link initPanelBridge} — мост к content-обёртке
 * (шлёт `ready`, чтобы обёртка не ушла в CSP-фолбэк, и слушает `state`).
 *
 * Страница грузится в cross-origin iframe обёртки (origin расширения), поэтому RPC к
 * background идёт тем же `chrome.runtime`-bus, что popup/side panel — ничего особого.
 */
import { render } from 'preact';
import '@/ui/global.css';
import '@/features'; // саморегистрация фич в реестре
import { initTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/components';
import { QASurface } from '@/ui/shell';
import { initPanelBridge } from './bridge';

initTheme();
initPanelBridge();

const root = document.getElementById('app');
if (root) {
  render(
    <ToastProvider>
      <QASurface variant="panel" />
    </ToastProvider>,
    root,
  );
}

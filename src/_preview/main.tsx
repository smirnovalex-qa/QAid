/** DEV-ONLY preview: mounts both real surfaces at their target sizes. */
import './chrome-shim';
import { render } from 'preact';
import '@/ui/global.css';
import '@/features';
import { ToastProvider } from '@/ui/components';
import { setThemeMode } from '@/ui/theme';
import { setLocale } from '@/i18n';
import { SidePanelShell, PopupShell } from '@/ui/shell';
import { mountPanelDemo } from './panel-demo';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.theme = theme; // preview: применяем тему напрямую
setThemeMode(theme);
setLocale(params.get('lang') === 'ru' ? 'ru' : 'en');

const sp = document.getElementById('sp');
const pu = document.getElementById('pu');

if (sp) {
  render(
    <ToastProvider>
      <SidePanelShell />
    </ToastProvider>,
    sp,
  );
}
if (pu) {
  render(
    <ToastProvider>
      <PopupShell />
    </ToastProvider>,
    pu,
  );
}

// Откреплённая плавающая панель (TASK-062): реальные обёртка+drag+clamp+collapse поверх
// демо-страницы для визуальной проверки (тело — placeholder, не extension-iframe).
mountPanelDemo();

import { render } from 'preact';
import '@/ui/global.css';
import '@/features'; // саморегистрация фич в реестре
import { initTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/components';
import { SidePanelShell } from '@/ui/shell';

initTheme();

const root = document.getElementById('app');
if (root) {
  render(
    <ToastProvider>
      <SidePanelShell />
    </ToastProvider>,
    root,
  );
}

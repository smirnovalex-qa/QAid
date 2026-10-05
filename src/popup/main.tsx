import { render } from 'preact';
import '@/ui/global.css';
import '@/features'; // side-effect: саморегистрация фич в реестре
import { initTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/components';
import { DevGallery } from '@/ui/DevGallery';
import { PopupShell } from '@/ui/shell';

initTheme();

const root = document.getElementById('app');
if (root) {
  // Dev-витрина компонентов доступна по #/__components (не выставляется юзеру).
  const isGallery = window.location.hash === '#/__components';
  render(<ToastProvider>{isGallery ? <DevGallery /> : <PopupShell />}</ToastProvider>, root);
}

/**
 * Подписи chrome-обёртки плавающей панели (TASK-062). Живут в content-реалме (отдельный
 * i18n-инстанс бандла `content-panel.js`), поэтому домешиваются здесь, а не в shell-каталоге
 * (который загружается в iframe тела панели). `host.ts` при монтаже выставляет локаль из
 * сохранённого `ui.locale`.
 */
import { mergeCatalog } from '@/i18n';

const EN: Record<string, string> = {
  'panel.title': 'QAnvil',
  'panel.collapse': 'Collapse',
  'panel.expand': 'Expand',
  'panel.close': 'Close panel',
  'panel.csp.title': 'Panel blocked',
  'panel.csp.body':
    'This page’s security policy blocks the embedded panel. Open the tool in the side panel instead.',
};

const RU: Record<string, string> = {
  'panel.title': 'QAnvil',
  'panel.collapse': 'Свернуть',
  'panel.expand': 'Развернуть',
  'panel.close': 'Закрыть панель',
  'panel.csp.title': 'Панель заблокирована',
  'panel.csp.body':
    'Политика безопасности этой страницы не разрешает встроить панель. Откройте инструмент в боковой панели.',
};

mergeCatalog('en', EN);
mergeCatalog('ru', RU);

/**
 * Дескриптор фичи «Скриншот с аннотациями» (TASK-027) + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются через `mergeCatalog`. Контракты склейки полной
 * страницы (`screenshot/*`, content-target) вносятся в протокол через `messages`;
 * их content-хендлеры поднимает `installScreenshotScrollHost()` в инспекционном
 * бандле (проводка — оркестратором). Режим элемента переиспользует пикер TASK-013
 * (`inspection/pick`), поэтому фиче нужна инъекция по требованию.
 *
 * `category: 'utils'` (PRD §7.8). `requiresPanel`: захват элемента/полной страницы
 * опирается на живой пик/прокрутку страницы — в transient-popup ненадёжно, поэтому
 * popup показывает fallback «открыть в side panel» (ADR-0025); в списках фича
 * остаётся видимой на обеих поверхностях.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import { screenshotMessages } from '@/shared/inspection/screenshot/messages';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'screenshot',
  title: 'feature.screenshot.title',
  category: 'utils',
  surface: 'both',
  requiresPanel: true,
  order: 200,
  icon: glyphIcon('▣'),
  load: () => import('./ui').then((m) => m.ScreenshotPanel),
  messages: screenshotMessages,
  // Захват кадра (`chrome.tabs.captureVisibleTab`) требует именно host-токена
  // `<all_urls>` (Chrome-гейт `CanCaptureVisiblePage` не принимает `*://*/*`); он же
  // покрывает host-доступ инъекции ISOLATED-хоста пикера/склейки. `scripting` +
  // `<all_urls>` — всё optional, запрашивается брокером под жестом при захвате.
  permissions: { optional: ['scripting'], host: ['<all_urls>'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

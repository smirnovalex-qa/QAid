/**
 * Дескриптор фичи «Мок сети» (TASK-022, R2) + саморегистрация (ADR-0011).
 *
 * Контракты `mock/*` адресованы `background`: MAIN-инъекция перехватчика и опрос
 * лога живут в service worker'е (как у эмуляции окружения), поэтому обработка — через
 * `backgroundHandlers`, а не content. Права (`scripting` + постоянный host-доступ)
 * запрашиваются брокером под жестом при включении перехвата (least-privilege,
 * ADR-0013). Категория `mock`; доступна на обеих поверхностях (ADR-0025), но по
 * смыслу — side panel (не терять контекст страницы при работе с запросами).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import { mockNetworkMessages } from './messages';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'mock-network',
  title: 'feature.mock.title',
  category: 'mock',
  surface: 'both',
  order: 130,
  icon: glyphIcon('⇄'),
  load: () => import('./ui').then((m) => m.MockNetworkPanel),
  messages: mockNetworkMessages,
  // `mockNetworkBackgroundHandlers` подключаются из background-барели
  // (`@/features/background`), а не из UI-дескриптора: перехватчик/CDP/replay-sender —
  // фоновой код, ему не место в графе popup/sidepanel (F6 TASK-046, ADR-0047).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
});

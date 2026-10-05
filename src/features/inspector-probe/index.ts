/**
 * Дескриптор эталонного инспектора + саморегистрация (ADR-0011).
 *
 * Единственный потребитель инспекционного слоя (TASK-013), проверяющий его
 * end-to-end: объявляет optional-права и content-инъекцию по требованию, вносит
 * инспекционные message-контракты в протокол. Background форвардит их в вкладку
 * генерически — конкретный `inspection/*` в ядре не упоминается. Реальные
 * инспекторы (контраст/палитра/шрифты) — TASK-014…016.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { inspectionMessages } from '@/shared/inspection/messages';
import { InspectorCursorIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'inspector-probe',
  title: 'feature.inspectorProbe.title',
  category: 'inspector',
  // Доступен на обеих поверхностях. Основная — side panel: живой захват элемента
  // требует персистентной поверхности (popup закрывается при клике по странице),
  // поэтому в popup показывается fallback «открыть в side panel» (ADR-0025).
  surface: 'both',
  requiresPanel: true,
  order: 50,
  icon: InspectorCursorIcon,
  load: () => import('./ui').then((m) => m.InspectorProbePanel),
  messages: inspectionMessages,
  // Host-доступ — постоянный (`*://*/*`), а не `activeTab`: инспектор в side panel
  // обязан следовать за переключением вкладок (ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

/**
 * Дескриптор фичи «Инспектор: линейка / измеритель» (TASK-018) + саморегистрация
 * (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются в общий каталог через `mergeCatalog`. Инспекционные
 * контракты вносятся в протокол через `messages` (те же объекты `inspectionMessages`,
 * дубли не создаются). Content-инъекция сборщика box-model — по требованию
 * (`injectOn: 'demand'`); сам `collectBoxModel` регистрируется в content-бандле
 * оркестратором (проводка вне этого файла).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { inspectionMessages } from '@/shared/inspection/messages';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'inspector-ruler',
  title: 'feature.ruler.title',
  category: 'inspector',
  // Доступен на обеих поверхностях. Основная — side panel: живой захват точек A/B
  // требует персистентной поверхности (popup закрывается при клике по странице),
  // поэтому в popup показывается fallback «открыть в side panel» (ADR-0025).
  surface: 'both',
  requiresPanel: true,
  order: 90,
  icon: glyphIcon('↔'),
  load: () => import('./ui').then((m) => m.InspectorRulerPanel),
  messages: inspectionMessages,
  // Host-доступ постоянный (`*://*/*`), а не `activeTab`: панель обязана следовать за
  // переключением вкладок (ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

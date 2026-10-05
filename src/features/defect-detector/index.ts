/**
 * Дескриптор фичи «Детектор дефектов» (TASK-024) + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются в общий каталог через `mergeCatalog`. Инспекционные
 * контракты вносятся в протокол через `messages`; content-инъекция сборщика — по
 * требованию (`injectOn: 'demand'`), а сам `collectDefects` регистрируется в
 * content-бандле оркестратором (проводка вне этого файла).
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
  id: 'defect-detector',
  title: 'feature.defects.title',
  category: 'inspector',
  // Скан страницы — программный (без живого пика), поэтому работает и в popup, и в
  // side panel (`both`); панель удобнее для длинных сгруппированных списков (ADR-0025).
  surface: 'both',
  order: 95,
  icon: glyphIcon('!'),
  load: () => import('./ui').then((m) => m.DefectDetectorPanel),
  messages: inspectionMessages,
  // Host-доступ постоянный (`*://*/*`), а не `activeTab`: панель обязана следовать за
  // переключением вкладок (ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

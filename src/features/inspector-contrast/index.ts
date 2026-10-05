/**
 * Дескриптор фичи «Инспектор: контраст WCAG» (TASK-014) + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются в общий каталог через `mergeCatalog`. Инспекционные
 * контракты вносятся в протокол через `messages`; content-инъекция сборщика — по
 * требованию (`injectOn: 'demand'`), а сам `collectContrast` регистрируется в
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
  id: 'inspector-contrast',
  title: 'feature.contrast.title',
  category: 'inspector',
  // Скан страницы — программный (без живого пика), поэтому работает и в popup, и в
  // side panel (`both`); панель удобнее для длинных списков образцов (ADR-0025).
  surface: 'both',
  order: 60,
  icon: glyphIcon('AA'),
  load: () => import('./ui').then((m) => m.InspectorContrastPanel),
  messages: inspectionMessages,
  // Host-доступ постоянный (`*://*/*`), а не `activeTab`: панель обязана следовать за
  // переключением вкладок (ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

/**
 * Дескриптор фичи «Snapshot-diff DOM/стилей (было/стало)» (TASK-028) +
 * саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются в общий каталог через `mergeCatalog`. Инспекционные
 * контракты вносятся в протокол через `messages` (переиспользуем `inspection/scan`
 * и `inspection/highlight` из TASK-013 — новых сообщений фича НЕ вводит);
 * content-инъекция сборщика — по требованию (`injectOn: 'demand'`), а сам
 * `collectSnapshot` регистрируется в content-бандле оркестратором (проводка вне
 * этого файла).
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
  id: 'snapshot-diff',
  title: 'feature.snapshotDiff.title',
  category: 'inspector',
  // Снимок страницы — программный (без живого пика), поэтому работает и в popup, и в
  // side panel (`both`); панель удобнее для длинных дифов (ADR-0025).
  surface: 'both',
  order: 96,
  icon: glyphIcon('Δ'),
  load: () => import('./ui').then((m) => m.SnapshotDiffPanel),
  messages: inspectionMessages,
  // Host-доступ постоянный (`*://*/*`), а не `activeTab`: панель обязана следовать за
  // переключением вкладок (ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

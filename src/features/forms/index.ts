/**
 * Дескриптор фичи «Формы: автозаполнение + аудит» (TASK-020) + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются в общий каталог через `mergeCatalog`. Content-target
 * контракты (`forms/fill`/`forms/clear`) вносятся в протокол через `messages`; аудит
 * переиспользует инспекционный `inspection/scan` с инспектором `forms`. Content-инъекция
 * заполнителя/сборщика — по требованию (`injectOn: 'demand'`); их регистрацию в
 * content-бандле (`registerInspector` + `installFormsContentHost`) проводит оркестратор.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { formsMessages } from '@/shared/inspection/forms/messages';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'forms',
  title: 'feature.forms.title',
  category: 'forms',
  // Заполнение/аудит — программные (без живого пика), поэтому доступен на обеих
  // поверхностях; side panel удобнее — не теряем контекст страницы (ADR-0025).
  surface: 'both',
  order: 110,
  icon: glyphIcon('▤'),
  load: () => import('./ui').then((m) => m.FormsPanel),
  messages: formsMessages,
  // Постоянный host-доступ (не `activeTab`): панель следует за сменой вкладок (ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  // Фича шлёт content-target сообщения → обязана декларировать инъекцию по требованию.
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

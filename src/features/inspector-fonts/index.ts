/**
 * Дескриптор инспектора шрифтов + саморегистрация (ADR-0011, TASK-016).
 *
 * Объявляет optional-права и content-инъекцию по требованию, вносит инспекционные
 * message-контракты в протокол (background форвардит их в вкладку генерически) и
 * домешивает свой каталог локализации. Регистрация конкретного сборщика в
 * content-хосте (`registerInspector('fonts', ...)`) выполняется оркестратором
 * отдельно — сам модуль сборщика (`collector.ts`) чист и не саморегистрируется.
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
  id: 'inspector-fonts',
  title: 'feature.fonts.title',
  category: 'inspector',
  // Скан программный (без живого пика) → доступен на обеих поверхностях (ADR-0025).
  surface: 'both',
  order: 80,
  icon: glyphIcon('Aa'),
  load: () => import('./ui').then((m) => m.InspectorFontsPanel),
  messages: inspectionMessages,
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

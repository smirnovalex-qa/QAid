/**
 * Дескриптор фичи «Инспектор: палитра цветов» (TASK-015) + саморегистрация
 * (ADR-0011).
 *
 * Страничный инспектор поверх общего инспекционного слоя (TASK-013): объявляет
 * optional-права и content-инъекцию по требованию, вносит инспекционные
 * message-контракты в протокол (background форвардит их в вкладку генерически).
 * Сам сборщик (`collector.ts`) — чистый модуль; его привязку к content-хосту
 * выполняет оркестратор слоя.
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
  id: 'inspector-palette',
  title: 'feature.palette.title',
  category: 'inspector',
  // Скан программный (без живого пика) → доступен на обеих поверхностях (ADR-0025).
  surface: 'both',
  order: 70,
  icon: glyphIcon('RGB'),
  load: () => import('./ui').then((m) => m.InspectorPalettePanel),
  messages: inspectionMessages,
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

/**
 * Дескриптор фичи «Мок: DOM-подмена выделением» (TASK-023, часть `dom-override`) +
 * саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются через `mergeCatalog`. Контракты `domOverride/*`
 * вносятся в протокол через `messages`. Content-хост применения
 * (`installDomOverrideContentHost`) поднимается в общем content-бандле оркестратором
 * (проводка вне этого файла, как для storage/forms) — здесь фича не импортирует
 * content-код (fitness §12.1: ядро/бандл не зависят от фич, а фича — от content-хоста).
 *
 * Категория `mock`, но подмена помечена как КОСМЕТИЧЕСКАЯ (не сетевой мок): держим её
 * отдельной фичей от `mock-network` (прямое требование PRD 7.5).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { domOverrideMessages } from '@/shared/inspection/dom-override/messages';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'dom-override',
  title: 'feature.domOverride.title',
  category: 'mock',
  // Доступна на обеих поверхностях, но живой захват элемента пикером требует
  // персистентной поверхности (popup закрывается при клике по странице), поэтому в
  // popup показывается fallback «открыть в side panel» (`requiresPanel`, ADR-0025).
  surface: 'both',
  requiresPanel: true,
  order: 155,
  icon: glyphIcon('▢'),
  load: () => import('./ui').then((m) => m.DomOverridePanel),
  messages: domOverrideMessages,
  // Host-доступ постоянный (`*://*/*`) + `scripting` (инъекция content-хоста по
  // требованию). Least-privilege: всё optional (ADR-0013/0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

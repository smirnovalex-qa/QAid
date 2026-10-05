/**
 * Дескриптор фичи «Эмуляция окружения» (TASK-019) + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * i18n домешивается в общий каталог. Контракты `environment/*` вносятся в протокол
 * через `messages`, а их обработка — через `backgroundHandlers` (DNR session-rules
 * + MAIN-world инъекция живут в SW, поэтому адресат — background, не content).
 * Права (`declarativeNetRequest` + `scripting` + host) запрашиваются брокером под
 * жестом при включении эмуляции (least-privilege, ADR-0013).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import { environmentMessages } from './messages';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'environment',
  title: 'feature.environment.title',
  category: 'environment',
  // Подмена окружения — программная (DNR + инъекция из SW), без живого пика по
  // странице, поэтому доступна и в popup, и в side panel (`both`, ADR-0025).
  surface: 'both',
  order: 120,
  icon: glyphIcon('🌐'),
  load: () => import('./ui').then((m) => m.EnvironmentPanel),
  messages: environmentMessages,
  // `environmentBackgroundHandlers` (DNR session-rules + MAIN-инъекция) подключаются
  // из background-барели (`@/features/background`), не из UI-дескриптора (F6 TASK-046,
  // ADR-0047).
  // `declarativeNetRequestWithHostAccess` объявлено install-time в манифесте (Chrome
  // не допускает DNR как optional). В рантайме брокером — только `scripting` +
  // постоянный host-доступ (`*://*/*`, не `activeTab`: эмуляция переживает
  // переключение/навигацию вкладок, ADR-0022).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
});

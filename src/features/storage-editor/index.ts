/**
 * Дескриптор фичи «Состояние браузера: редактор storage/cookies» (TASK-017) +
 * саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
 * фрагменты i18n домешиваются через `mergeCatalog`. Контракты вносятся в протокол
 * через `messages` (web storage — content-target, cookies — background-target);
 * `backgroundHandlers` подключаются ядром генерически. Content-инъекция web-storage
 * моста — по требованию (`injectOn: 'demand'`), а сам `installStorageContentHost`
 * поднимается в content-бандле оркестратором (проводка вне этого файла).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { storageEditorMessages } from '@/shared/inspection/storage/messages';
import { idbMessages } from '@/shared/inspection/idb/messages';
import { cacheMessages } from '@/shared/inspection/cache/messages';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'storage-editor',
  title: 'feature.storageEditor.title',
  category: 'storage',
  // Чтение/запись storage и cookies — программные (без живого пика), поэтому доступен
  // на обеих поверхностях; side panel удобнее — не теряем контекст страницы (ADR-0025).
  surface: 'both',
  order: 100,
  icon: glyphIcon('DB'),
  load: () => import('./ui').then((m) => m.StorageEditorPanel),
  // Web storage + cookies (TASK-017) плюс IndexedDB и Cache Storage (TASK-031) —
  // все content-контракты форвардятся генерически. Cookies-хендлеры (background-target)
  // подключаются из background-барели (`@/features/background`), а не из UI-дескриптора,
  // чтобы граф popup/sidepanel не тянул фоновой cookies-код (F6 TASK-046, ADR-0047).
  messages: [...storageEditorMessages, ...idbMessages, ...cacheMessages],
  // Host-доступ постоянный (`*://*/*`) + `scripting` (web storage) и `cookies`
  // (запрашивается при открытии cookies-таба). Least-privilege: всё optional.
  permissions: { optional: ['scripting', 'cookies'], host: ['*://*/*'] },
  content: { world: 'ISOLATED', injectOn: 'demand' },
});

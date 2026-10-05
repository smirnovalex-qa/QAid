/**
 * Дескриптор фичи «Профили сессий: hot-swap авторизации» (TASK-047) +
 * саморегистрация (ADR-0011, ADR-0048).
 *
 * Импорт `./ui` (транзитивно `./settings`) ленивый (ADR-0047): метаданные
 * регистрируются жадно, тело панели резолвится динамическим `import()` при первой
 * активации. Фрагменты i18n домешиваются в общий каталог через `mergeCatalog`.
 *
 * Осознанно НЕТ `messages`/`backgroundHandlers`/`content` (ADR-0048): фича не вводит
 * собственных контрактов — hot-swap оркеструется на стороне поверхности через УЖЕ
 * существующие RPC редактора состояния (TASK-017): `cookies/list|set|remove|clear`
 * (background-target, `chrome.cookies` умеет `HttpOnly`) и `storage/list|set|remove|
 * clear` (content-target, генерически форвардятся с инъекцией content-хоста). Перезагрузка
 * вкладки после свапа — платформенный seam `tabs.reload`. Так фича не переобъявляет
 * контракты (иначе дубль id — падение architecture-fitness §12.3), не трогает
 * content-бандл и background-барель, а инвариант расширяемости сводится к одной строке
 * импорта в `@/features` (ARCHITECTURE §13).
 *
 * Права (`scripting` + `cookies` + постоянный host-доступ ко всем http/https-origin) —
 * те же optional, что у storage-editor: НОВЫХ install-прав фича не вводит; брокер запрашивает их под жестом
 * при первом захвате/свапе (least-privilege, ADR-0013). Отказ в `cookies` не роняет
 * фичу — деградирует до web storage (см. UI).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'session-profiles',
  title: 'feature.sessionProfiles.title',
  category: 'storage',
  // Захват/применение состояния — программные (RPC + reload), без живого пика по
  // странице, поэтому доступна на обеих поверхностях; side panel удобнее — не теряем
  // контекст вкладки при подтверждении свапа (ADR-0025).
  surface: 'both',
  order: 110,
  icon: glyphIcon('🔑'),
  load: () => import('./ui').then((m) => m.SessionProfilesPanel),
  // Least-privilege: те же optional-права, что у редактора состояния (TASK-017).
  // Новых прав в манифест НЕ добавляется — переиспользуются `scripting`/`cookies`/host.
  permissions: { optional: ['scripting', 'cookies'], host: ['*://*/*'] },
});

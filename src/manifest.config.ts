import { defineManifest, type ManifestV3Export } from '@crxjs/vite-plugin';
import pkg from '../package.json';
import { toExtensionVersion } from './shared/version';

/**
 * Тип манифеста @crxjs отстаёт от актуальных Chrome-типов и не содержит
 * `optional_host_permissions`. Расширяем его, чтобы зарезервировать поле
 * (пустым) без потери типобезопасности остального манифеста.
 */
type QaManifest = ManifestV3Export & {
  optional_host_permissions?: string[];
  web_accessible_resources?: {
    resources: string[];
    matches?: string[];
    use_dynamic_url?: boolean;
  }[];
};

/**
 * Типизированный Manifest V3 (@crxjs). Единственный источник версии —
 * `package.json` (semver): `version` нормализуется для Chrome, полный semver
 * сохраняется в `version_name`. Пути к бандлам не хардкодятся — @crxjs
 * подставляет и хеширует их сам; ссылаемся только на исходные `.html`/`.ts`.
 *
 * Least-privilege (ADR-0013): в манифесте — только всегда-нужные права
 * (`storage`, `sidePanel`). Остальное декларируется фичами и запрашивается
 * брокером в рантайме; под них зарезервированы пустые `optional_*`.
 */
const manifest: QaManifest = {
  manifest_version: 3,
  name: 'QAid',
  description:
    'Консолидированный набор QA-инструментов: генераторы, инспектор, storage, декодеры. Локально и приватно.',
  version: toExtensionVersion(pkg.version),
  version_name: pkg.version,
  default_locale: 'ru',
  icons: {
    '16': 'src/assets/icons/icon-16.png',
    '32': 'src/assets/icons/icon-32.png',
    '48': 'src/assets/icons/icon-48.png',
    '128': 'src/assets/icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'QAid',
    default_icon: {
      '16': 'src/assets/icons/icon-16.png',
      '32': 'src/assets/icons/icon-32.png',
    },
  },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  // `declarativeNetRequestWithHostAccess` (TASK-019) — install-time, а НЕ optional:
  // Chrome ЗАПРЕЩАЕТ перечислять `declarativeNetRequest*` в `optional_permissions`
  // (оно молча отбрасывается, а рантайм-`permissions.request` затем падает с «Only
  // permissions specified in the manifest may be requested»). Поэтому декларируем его
  // в манифесте. Берём именно host-гейтную разновидность: её правила действуют только
  // на запросы к origin'ам, к которым у расширения УЖЕ есть host-доступ — сам API-грант
  // не даёт ничего наблюдаемого и не поднимает широкого install-warning. Чувствительная
  // часть (host `*://*/*`) остаётся optional и запрашивается брокером под жестом при
  // включении эмуляции — так фича по-прежнему opt-in по факту (ADR-0013/0026).
  //
  // `debugger` (TASK-032, CDP-режим мока) — тоже install-time, а НЕ optional: Chrome
  // ЗАПРЕЩАЕТ `debugger` в `optional_permissions` (тот же список, что и DNR) — рантайм
  // `permissions.request` его отвергает. В отличие от DNR, install-warning здесь виден
  // («доступ к отладчику страниц»): сознательный компромисс (ADR-0038) ради второго
  // транспорта перехвата (запросы в обход MAIN-обёрток: воркеры/`sendBeacon`, строгий
  // CSP). Наблюдаемый эффект — attach + баннер отладки — возникает ТОЛЬКО под жестом при
  // выборе CDP-режима; MAIN остаётся дефолтом и `debugger` не использует.
  //
  // `offscreen` (TASK-037, запись экрана) — install-time, а НЕ optional. `MediaRecorder`
  // недоступен в service worker, поэтому запись ведёт единственный offscreen-документ
  // (`offscreen`). Видео захватывается ЕДИНСТВЕННЫМ путём — `getDisplayMedia` ПРЯМО в
  // offscreen (offscreen reason `DISPLAY_MEDIA`; нативный пикер «Выберите, чем поделиться»
  // при каждом старте = согласие). Это стандартный web-API без манифест-права. С ревизии
  // 2026-09-21 (bugfix 4) бесшовный вкладочный путь удалён, поэтому право `tabCapture`
  // БОЛЬШЕ НЕ НУЖНО и снято (least-privilege); ранее снят и `desktopCapture` (его `streamId`
  // границу side panel → offscreen не переживал, «Invalid state»; ADR-0045). Звук системы/
  // вкладки — чекбокс того же `getDisplayMedia`. Микрофон — рантайм `getUserMedia`, но НЕ в
  // offscreen: с ревизии 2026-09-22 (bugfix 6) запись С микрофоном ведёт видимая
  // вкладка-рекордер (`src/features/screen-recording/recorder-tab/`), т.к. `getUserMedia`
  // надёжно отдаёт грант только тому документу, который сам его запросил под жестом — грант
  // из отдельной вкладки в offscreen НЕ пробрасывается (падало `NotAllowedError` без
  // запроса — корень бага). Вкладка открывается через `tabs.create` (право `tabs` не нужно)
  // и манифест-права не требует. `offscreen` (путь без микрофона) install-warning не
  // поднимает; наблюдаемый захват — только под жестом + системным пикером/промптом.
  permissions: [
    'storage',
    'sidePanel',
    'declarativeNetRequestWithHostAccess',
    'debugger',
    'offscreen',
  ],
  host_permissions: [],
  // Least-privilege (ADR-0013/0020/0022): инспекционный слой (TASK-013) запрашивает
  // `scripting` + host-доступ в рантайме брокером под пользовательским жестом, а не
  // при установке.
  //
  // Host-доступ — постоянный optional (`*://*/*`), а НЕ `activeTab` (ADR-0022):
  // `activeTab` даёт доступ лишь к вкладке в момент инвокации расширения и не
  // распространяется на вкладки, куда пользователь переключается позже. Для side
  // panel это ломало инспектор при смене вкладки (чинилось лишь переоткрытием
  // панели). Постоянный host-грант переживает переключение вкладок; служебные
  // страницы (`chrome://`, магазин) остаются недоступными по политике браузера и
  // обрабатываются мягко. Запрос охватывает http/https; `file://` требует отдельного
  // тумблера в настройках расширения и вне области инспектора.
  // `cookies` (TASK-017) — редактор cookies активного домена. Как и `scripting`,
  // запрашивается брокером под жестом при первом открытии cookies-вкладки, а не при
  // установке (least-privilege, ADR-0013).
  optional_permissions: ['scripting', 'cookies'],
  // Два host-паттерна, оба optional и запрашиваемые брокером под жестом:
  // • `*://*/*` — рабочий host-доступ инспекции/cookies/эмуляции ко всем http/https
  //   (ADR-0022, сознательно БЕЗ `file://`/`ftp://`).
  // • `<all_urls>` — нужен ИМЕННО для `chrome.tabs.captureVisibleTab` (скриншот,
  //   TASK-027): Chrome-гейт `CanCaptureVisiblePage` принимает только литеральный
  //   токен `<all_urls>` либо `activeTab` — паттерн `*://*/*` его НЕ удовлетворяет
  //   (иначе рантайм падает «Either the '<all_urls>' or 'activeTab' permission is
  //   required»). Токен объявлен здесь, чтобы скриншот мог запросить его под жестом.
  optional_host_permissions: ['*://*/*', '<all_urls>'],
  // Инъектируемые по требованию content-хосты (`content-inspection.js`, `content-panel.js`)
  // собираются отдельными IIFE-бандлами (ADR-0020/0053, `scripts/build-content.mjs`) и
  // инъектируются через `scripting.executeScript({ files })` — Chrome не требует для таких
  // ФАЙЛОВ web-accessible-декларации.
  //
  // Откреплённая плавающая панель (TASK-062, ADR-0053) рисует тело в cross-origin `<iframe>`
  // на extension-страницу `src/panel/index.html`. Чтобы веб-страница могла её фреймить, сам
  // документ панели объявляется web-accessible. **Это НЕ permission** — install-warning не
  // поднимает, least-privilege сохраняется (новых прав нет; host/scripting уже optional из
  // брокера). `use_dynamic_url: true` — анти-фингерпринт (URL ресурса не постоянный меж
  // сессий); `matches` сознательно сужен до `*://*/*` (http/https, как рабочий host-доступ;
  // без `file://`, согласованно с ADR-0022). Пути бандлов тела панели @crxjs подставит сам.
  web_accessible_resources: [
    {
      resources: ['src/panel/index.html'],
      matches: ['*://*/*'],
      use_dynamic_url: true,
    },
  ],
};

export default defineManifest(manifest);

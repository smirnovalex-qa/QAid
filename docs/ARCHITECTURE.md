# Архитектура — QAnvil

Технический обзор для исполнителей. Единый источник правды по стеку, границам модулей и соглашениям. Любое отклонение фиксируется как ADR в [DECISIONS.md](./DECISIONS.md).

---

## 1. Обзор

QAnvil — расширение Manifest V3 с несколькими поверхностями (popup, side panel, background service worker, content scripts, page-context/MAIN-world скрипт). Основная логика инструментов — чистые функции без зависимостей от DOM/Chrome, что делает их полностью юнит-тестируемыми. UI строится на Preact и подключает фичи через реестр (feature registry).

Ключевые архитектурные принципы:

- **Local-first / offline-first.** Ни один инструмент ядра не делает сетевых запросов. Вся генерация и обработка данных — в браузере пользователя.
- **Least privilege.** Права запрашиваются минимально и по мере необходимости, а не «всё сразу»; каждая фича декларирует нужные ей права, брокер запрашивает их just-in-time.
- **Pure core, thin UI.** Бизнес-логика в `logic.ts` (без Preact/Chrome), UI — тонкий слой представления.
- **Feature isolation.** Каждая фича самодостаточна и регистрируется в реестре как единый дескриптор возможностей; удаление фичи не ломает остальные.
- **Typed boundaries.** Все межпроцессные сообщения типизированы (discriminated unions) и валидируются в рантайме (zod).
- **Federated contracts (открытые контракты).** Протокол сообщений, события и i18n **не** редактируются централизованно при добавлении фичи — фича приносит свой вклад, а ядро собирает его автоматически. Центральных «файлов-чокпоинтов» нет by design.
- **Platform-agnostic.** Доступ к WebExtensions API идёт только через адаптер `src/platform`, что делает порт Chrome→Firefox дешёвым.

> **Инвариант расширяемости (главная цель архитектуры).** Добавление новой фичи затрагивает **только** её собственный каталог `src/features/<feature>/**` плюс одну строку в барреле саморегистрации. Ни `background`, ни `popup/sidepanel`, ни протокол сообщений, ни манифест, ни i18n-каталоги **не редактируются** руками. Соблюдение этого инварианта проверяется architecture-fitness тестами (см. §12). Именно он снижает риск «переписывания кода из-за новой фичи».

---

## 2. Технологический стек

| Слой | Выбор | Причина |
|---|---|---|
| Язык | TypeScript 5.x strict | Типобезопасность, DX |
| Пакетный менеджер | pnpm | Скорость, строгий node_modules |
| Сборка | Vite + `@crxjs/vite-plugin` | HMR для расширений, MV3 из коробки |
| UI | Preact + `@preact/signals` | Малый бандл, реактивность |
| Кросс-браузер | `webextension-polyfill` через `src/platform` | Единый promise-API, дешёвый порт на Firefox |
| Стили | CSS Modules + токены | Изоляция, темизация без runtime-CSS-in-JS |
| Валидация | zod | Рантайм-схемы + вывод типов |
| Хранилище | `chrome.storage.local` (обёртка) | Персист настроек/пресетов |
| Юнит-тесты | Vitest + Testing Library | Скорость, совместимость с Vite |
| E2E | Playwright | Загрузка unpacked-расширения, драйв popup/side panel |
| Линт | ESLint flat + typescript-eslint | Type-aware правила |
| Формат | Prettier | Единый стиль |
| Хуки | Husky + lint-staged + commitlint | Гейты качества до пуша |
| CI/CD | GitHub Actions | Проверки PR + релизный пайплайн |

---

## 3. Структура кода

```
src/
├── platform/
│   └── index.ts              # адаптер WebExtensions (browser = webextension-polyfill)
├── background/
│   ├── index.ts              # entry service worker: installRouter() + wiring из реестра
│   └── router.ts             # маршрутизация типизированных сообщений (из реестра хендлеров)
├── content/
│   ├── index.ts              # content script (ISOLATED world), инъекция по требованию
│   └── relay.ts              # релей MAIN-world ↔ background (window.postMessage ↔ runtime)
├── page/
│   └── main-world.ts         # скрипт в MAIN world (перехват fetch/XHR для будущего мока)
├── popup/
│   ├── index.html
│   ├── main.tsx              # монтирование Preact
│   └── App.tsx               # shell + навигация по реестру фич
├── sidepanel/
│   ├── index.html
│   └── main.tsx
├── features/
│   ├── index.ts              # барель саморегистрации (единственная правка при новой фиче)
│   ├── registry.ts           # реестр фич + сборка вкладов (сообщения, права, i18n, события)
│   └── <feature>/
│       ├── logic.ts          # чистая логика (без Preact/Chrome) — макс. покрытие тестами
│       ├── ui.tsx            # представление
│       ├── messages.ts       # вклад в протокол: request/response схемы (опц.)
│       ├── handlers.ts       # background-хендлеры фичи (опц.)
│       ├── settings.ts       # схема настроек/пресетов фичи + миграции (опц.)
│       ├── i18n/{ru,en}.ts   # фрагменты каталогов локализации фичи (опц.)
│       ├── index.ts          # дескриптор возможностей + саморегистрация
│       └── __tests__/
├── shared/
│   ├── random.ts             # безопасный ГПСЧ (crypto.getRandomValues)
│   ├── messaging/
│   │   ├── contract.ts       # открытый MessageContracts (declaration merging), хелперы типов
│   │   ├── registry.ts       # рантайм-реестр схем: type → {request, response}
│   │   ├── bus.ts            # sendMessage / registerHandler поверх транспортов
│   │   └── transports.ts     # runtime / tabs / window транспорты (единый интерфейс)
│   ├── events.ts             # типизированная cross-feature шина событий (AppEvents)
│   ├── storage.ts            # обёртка над chrome.storage.local (см. TASK-005)
│   ├── serialization.ts      # версионируемый конверт {kind, schemaVersion, data} + миграции
│   ├── permissions.ts        # брокер optional-permissions (least-privilege рантайм)
│   ├── clipboard.ts          # копирование с фолбэком
│   ├── logger.ts             # структурное логирование
│   └── result.ts             # Result<T,E> для явной обработки ошибок
├── ui/
│   ├── tokens.css            # дизайн-токены
│   ├── theme.ts              # переключение/персист темы
│   └── components/           # Button, Input, Select, Tabs, Card, Toast, Field...
└── i18n/
    ├── index.ts              # загрузчик: shell-строки + фрагменты из реестра фич
    ├── ru.ts                 # только общие/shell строки
    └── en.ts
```

**Правило слоёв:** `features/*/logic.ts` не импортирует Preact и Chrome/`platform`. `ui/` не знает о конкретных фичах. `shared/` не зависит от `features/`. Chrome API вызывается только через `src/platform` (кроме тонких транспортов в `shared/messaging`). Зависимости направлены внутрь: `features → shared/ui/platform`; `popup/sidepanel → registry → features`. Обратные зависимости запрещены и enforce'ятся ESLint `no-restricted-imports`.

---

## 4. Поверхности расширения и их роли

- **Popup** — быстрый доступ к инструментам без контекста страницы (генераторы, декодеры).
- **Side Panel** — инструменты, которым нужен контекст страницы и место (инспектор, мок).
- **Background service worker** — координация, роутинг сообщений, работа с правами/сетью (для будущего мока). Без persistent-состояния (MV3): реестр хендлеров регистрируется при каждом старте worker'а в top-level модуля, состояние — в `chrome.storage`.
- **Content scripts (ISOLATED world)** — инъекция по требованию для инспекции/подмены DOM; имеют доступ к `chrome.runtime`, служат мостом между страницей и background.
- **Page-context script (MAIN world)** — перехват `fetch`/`XHR` для будущего мока; **не** имеет доступа к `chrome.*`, общается с ISOLATED-миром только через `window.postMessage` (см. §6).

Разделение ISOLATED/MAIN и мост между ними заложены в архитектуру **сейчас**, хотя инспектор и мок реализуются в следующих волнах — чтобы не переписывать модель сообщений под первую же фичу с content-скриптом.

---

## 5. Модель сообщений — федеративный протокол

Централизованного файла-union, который правит каждая фича, **нет**. Протокол открыт для расширения через два механизма:

1. **Compile-time (типы) — declaration merging.** Фича расширяет открытый интерфейс `MessageContracts` в своём `messages.ts`:

   ```ts
   // features/inspector/messages.ts
   import { z } from 'zod';
   import { defineMessage } from '@/shared/messaging/registry';

   export const CollectColors = defineMessage(
     'inspector:collectColors',
     z.object({ tabId: z.number() }),                 // request
     z.object({ colors: z.array(z.string()) }),       // response
   );

   declare module '@/shared/messaging/contract' {
     interface MessageContracts {
       'inspector:collectColors': {
         request: z.infer<typeof CollectColors.request>;
         response: z.infer<typeof CollectColors.response>;
       };
     }
   }
   ```

2. **Runtime (валидация) — реестр схем.** `defineMessage` кладёт zod-схемы в `messaging/registry` (`type → {request, response}`). На каждой границе среды сообщение валидируется схемой, найденной по полю `type`; доверять `unknown` из `runtime`/`postMessage` нельзя.

Центральный `contract.ts` содержит только **пустой** `interface MessageContracts {}` и производные хелперы:

```ts
export type AnyMessageType = keyof MessageContracts;
export type RequestOf<T extends AnyMessageType> = MessageContracts[T]['request'];
export type ResponseOf<T extends AnyMessageType> = MessageContracts[T]['response'];
```

Клиент и роутер типобезопасны без единого редактирования при добавлении сообщения:

```ts
const res = await sendMessage('inspector:collectColors', { tabId }); // Result<ResponseOf<'inspector:collectColors'>>
```

Ошибки не пробрасываются через границу процесса «голыми» — оборачиваются в `Result<T, E>` (сериализуемый `AppError`, не инстанс `Error`) и логируются. Отсутствие хендлера → `AppError{code:'NO_RECEIVER'}`, невалидный payload → `AppError{code:'VALIDATION'}`.

---

## 6. Мост между средами (messaging bridge)

Единый API `sendMessage`/`registerHandler` работает поверх сменных транспортов — код фичи не знает, через какой канал идёт сообщение:

| Направление | Транспорт | Комментарий |
|---|---|---|
| UI (popup/sidepanel) ↔ background | `chrome.runtime` | основной канал |
| content (ISOLATED) → background | `chrome.runtime` | тот же клиент |
| background → content (ISOLATED) | `chrome.tabs.sendMessage` | адресация по `tabId` |
| content (ISOLATED) ↔ page (MAIN) | `window.postMessage` | MAIN-world не имеет `chrome.*` |

Ключевой нетривиальный путь — **MAIN world → background**: скрипт страницы шлёт `window.postMessage` → `content/relay.ts` принимает, валидирует zod-схемой и переотправляет в background через `runtime`; ответ идёт обратной цепочкой. Корреляция запрос/ответ — по генерируемому `correlationId`; на `postMessage` фильтруется `event.source === window` и сигнатура-маркер, чтобы не ловить чужие сообщения страницы.

Диаграмма сред и поток сообщений (реализовано в TASK-003):

```
        ┌──────────────────────────┐
        │  popup / sidepanel (UI)   │
        │  sendMessage() → Result   │
        └────────────┬─────────────┘
             chrome.runtime (runtimeTransport)
                     │
                     ▼
        ┌──────────────────────────┐        chrome.tabs (tabsTransport)
        │  background service worker │ ───────────────────────────────┐
        │  installRouter() + реестр  │                                 ▼
        │  хендлеров из дескрипторов │                    ┌───────────────────────────┐
        └────────────▲─────────────┘                     │  content script (ISOLATED)  │
                     │                                    │  relay.ts (валидация+фильтр)│
             chrome.runtime (runtimeTransport)            └────────────▲──────────────┘
                     │                                       window.postMessage (windowTransport)
                     └───────────────────────────────────────────────  │
                                                          ┌─────────────┴──────────────┐
                                                          │  page script (MAIN world)   │
                                                          │  нет chrome.* — только окно │
                                                          └─────────────────────────────┘
```

Каждый конверт — `{ type, payload, correlationId }`; ошибка — сериализуемый `{ type:'__error__', error: AppError }`. На каждой границе `payload` валидируется схемой из реестра по `type` (доверять `unknown` нельзя). Клиент `sendMessage` не бросает исключений — нормализует любой сбой в `Result<T, AppError>`.

Абстракция `Transport` (`shared/messaging/transports.ts`) и релей заложены как контракт сразу. Для фич первой волны (чистые popup-инструменты) они не задействуются, но их наличие означает, что инспектор/мок подключаются **без** переписывания шины.

---

## 7. Реестр фич — дескриптор возможностей (capability descriptor)

Фича описывается **единым дескриптором**, покрывающим все её пересечения с системой, а не только UI-панель. Ядро подключает каждый аспект генерически, поэтому фиче не нужно «дотягиваться» до background, манифеста или i18n руками.

```ts
// shared/messaging и др. — типы вкладов
export interface FeatureModule {
  id: string;                              // 'jwt-decoder'
  title: string;                           // i18n-ключ
  category: FeatureCategory;               // 'generators' | 'inspector' | 'storage' | 'environment' | 'forms' | 'utils' | 'mock'
  icon?: ComponentType;
  order?: number;
  surface?: 'popup' | 'sidepanel' | 'both';  // где инструмент ПЕРЕЧИСЛЕН; по умолчанию 'both'
  requiresPanel?: boolean;                 // нужен живой пик по странице → в popup fallback (ADR-0025)
  Component: ComponentType;                // ui.tsx

  // — необязательные вклады, подключаются ядром автоматически —
  permissions?: {                          // least-privilege: запрашиваются just-in-time
    optional?: string[];                   // напр. ['scripting']
    host?: string[];                       // напр. ['<all_urls>']
  };
  messages?: MessageContribution[];        // request/response схемы (см. §5)
  backgroundHandlers?: HandlerContribution[]; // регистрируются в SW при старте
  content?: {                              // потребность в content/page скриптах
    world: 'ISOLATED' | 'MAIN';
    injectOn: 'demand';                    // инъекция по требованию, не в манифесте
  };
  settings?: FeatureSettingsConfig<unknown>;  // схема+дефолты+миграции (TASK-005)
  i18n?: Record<Locale, CatalogFragment>;  // фрагменты каталогов
  events?: EventContribution[];            // публикуемые/потребляемые события (§9)
  teardown?: () => void;                   // корректное освобождение ресурсов
}
```

Регистрация — одна строка на фичу:

```ts
// features/jwt-decoder/index.ts
registerFeature({
  id: 'jwt-decoder',
  title: 'feature.jwt.title',
  category: 'utils',
  surface: 'popup',
  Component: JwtDecoderPanel,
  settings: jwtSettings,
});
```

**Как ядро использует дескриптор:**
- `popup/sidepanel` рендерят навигацию и панель из `Component`/`category`/`surface`. По
  умолчанию `surface: 'both'` — инструмент виден в strip popup И в рельсе side panel
  (паритет поверхностей, ADR-0025). `requiresPanel` (живой пик по странице) не влияет на
  доступность в списках: инструмент виден в обеих, но в transient-popup (закрывается при
  клике по странице) рендерит fallback «открыть side panel» вместо сломанного пикера.
- `background/index.ts` при старте итерирует реестр и регистрирует все `backgroundHandlers` и `messages` — руками background не трогается.
- Брокер прав (`shared/permissions.ts`) при активации фичи запрашивает её `permissions` через `chrome.permissions.request`.
- Загрузчик i18n подмешивает `i18n`-фрагменты в общий каталог.
- Storage-слой инициализирует `settings` в namespace фичи.

Единственная общая правка при добавлении фичи — импорт её `index.ts` в `features/index.ts` (барель саморегистрации; порядок явный и детерминированный).

### Общие UI-утилиты (TASK-008)

Переиспользуемый фундамент для всех фич — единая точка импорта `@/ui` (барель [src/ui/index.ts](../src/ui/index.ts)):

- **`useCopy`** ([ui/clipboard/useCopy.ts](../src/ui/clipboard/useCopy.ts)) — хук копирования поверх `copyText` (navigator.clipboard + `execCommand`-фолбэк) с реактивным `status`-сигналом (`idle/copied/error`), авто-сбросом и интеграцией с тостами. Клипборд требует user-gesture — вызывать только в обработчике клика.
- **`OutputPanel`** — readonly-область вывода (моноширинная, скролл, встроенная кнопка копирования, счётчик, пустое состояние). **`FeaturePanel`** — семантичный layout-wrapper (`section[aria-labelledby]` + `h2`, тело/вывод/футер-действия).
- **Экспорт** ([shared/export/export.ts](../src/shared/export/export.ts)) — чистые `toPlainText/toJSON/toCSV/toExport` + `escapeCsvField` (единый источник правды CSV): RFC 4180 (кавычки, удвоение `"`, `\r\n`) и защита от CSV-инъекций (`= + - @`/таб/CR → префикс `'`), только внутри CSV — plain/JSON сохраняют исходные значения и числовые типы.
- **Валидация** ([shared/validation/validators.ts](../src/shared/validation/validators.ts)) — `required/isFiniteNumber/isInteger/inRange/minLen/maxLen`, `compose` (собирает **все** ошибки) и `fieldA11y` (пропсы `aria-invalid`/`aria-describedby` + регион ошибки).

Тосты (`ToastProvider`/`useToast`) и базовые компоненты (`Button`/`Card`/`Field`/`Input`/`Select`/`Tabs`) — из дизайн-системы TASK-004; TASK-008 их не дублирует, а переиспользует. Экспорт и валидация живут в `shared/**` (framework-free), чтобы их можно было звать и из `logic.ts`.

---

## 8. Права и least-privilege (permission broker)

- Манифест содержит **только** всегда-нужные права (`storage`, `sidePanel`). Всё остальное — в `optional_permissions`/`optional_host_permissions`.
- Фича декларирует нужные права в дескрипторе (`permissions`). Брокер `shared/permissions.ts` предоставляет `ensure(feature)`/`has(feature)` поверх `chrome.permissions.request/contains` и запрашивает их **в момент первого использования** фичи (пользовательский жест), а не при установке.
- Отказ в правах не роняет расширение: фича показывает объяснение и остаётся неактивной; ядро не деградирует.
- Каждое право документируется в `docs/PERMISSIONS.md` (право → зачем → когда запрашивается → фича).

Это делает добавление «тяжёлой» фичи (инспектор с `scripting`, мок с `declarativeNetRequest`/`debugger`) вопросом декларации, а не правки центральной permission-логики.

### Реализация брокера (TASK-013)

- `createPermissionBroker(deps?)` поверх платформенного seam'а `BrowserPermissions` (инъектируется для юнит-тестов без Chrome, ADR-0014): `has` → `permissions.contains`. Кэш результатов `has()` инвалидируется на `onAdded`/`onRemoved`. Отказ/исключение платформы гасятся в `false` — наружу исключения не идут.
- `ensure` **не дёргает `request()` вслепую** (правка ADR-0013): (1) если право уже подтверждено кэшем — возвращает `true` синхронно, без `request()`; (2) иначе вызывает `request()` (первый и единственный `await` в ветке — жест жив); (3) если `request()` кинул «must be called during a user gesture» (частый в side panel случай на УЖЕ выданном праве), деградирует к `contains()` без жеста. Это устраняет ложные отказы на повторных действиях фичи.
- `ensure` для **реального первого гранта** вызывается **только** из обработчика пользовательского жеста (поверхность popup/side panel), иначе браузер отклонит запрос; из background без жеста доступна лишь `has()`.

---

## 8a. Инспекционный слой (TASK-013)

Переиспользуемый foundation, поверх которого фичи R1.1+ (контраст/палитра/шрифты/линейка, storage, эмуляция, формы, мок, детектор дефектов) работают с активной вкладкой, **не** дублируя логику инъекции, моста и запроса прав.

**Инъекция по требованию (ADR-0020).** Content-хост не в статических `content_scripts`, а инъектируется `chrome.scripting.executeScript` при первом запуске инструмента. Менеджер `background/inspection.ts`:

- `ensureContentScript(tabId)` — проба живости (`inspection/ping` с коротким дедлайном) → при отсутствии ответа инъекция `content-inspection.js` (отдельный самодостаточный IIFE-бандл, `scripts/build-content.mjs`). Идемпотентность — guard-флаг `window.__qatb_inspection__`. Ошибки (привилегированная страница, нет прав) → типизированный `AppError` с `messageKey` для локализованного объяснения.
- `installInspectionForwarding()` — генерически регистрирует форвардинг-хендлеры для всех сообщений с `target: 'content'` (кроме внутреннего ping): гарантирует инъекцию и пересылает валидированный запрос в вкладку (`chrome.tabs.sendMessage`), возвращая её ответ. Конкретные `inspection/*` в ядре не упоминаются.

**Инспекционный RPC.** `shared/inspection/messages.ts`: `inspection/ping|pick|pickLive|pickLiveStop|navigate|collect|scan|highlight|teardown` через `defineMessage(..., { target: 'content' })` (zod request/response, declaration merging). `collect` — сборщик на выбранном пикером узле; `scan` — тот же сборщик по всей странице (`document.body`, без якоря; путь страничных инспекторов); `highlight` — генерическая подсветка узла по селектору (`querySelector`+`scrollIntoView`+рамка) без переноса DOM-ссылок через границу (ADR-0023). Сборщик может быть async — `collect`/`scan` его дожидаются. Триггер инъекции — на уровне сообщения (`target`), а дескриптор `FeatureModule.content: { world, injectOn }` декларирует контракт инъекции фичи (нагружен fitness-инвариантом §12.6). Ошибки доносятся типизированно через `AppErrorException` (роутер разворачивает в error-конверт).

**Навигация по DOM-иерархии (TASK-052, ADR-0049).** «Проваливание» в элементы (родитель/первый ребёнок/соседи/breadcrumb-прыжок) для всех `inspector-*` — как **stateful-команда над якорем**, а не перенос DOM-узла в UI (узлы не пересекают границу сред). UI шлёт `inspection/navigate(step, depth?)`, content-хост применяет `resolveStep` к `lastPicked`, **обновляет якорь**, перерисовывает подсветку оверлея + `scrollIntoView` и возвращает наружу только снимок `NavigationState` (дескрипторы). `inspection/pick` аддитивно расширен — возвращает снимок-надмножество `PickedElement` + `navigation` (breadcrumb без лишнего round-trip; старые потребители читают `selector`/`rect` с верхнего уровня). Чистая модель — `shared/inspection/navigation.ts` (`resolveStep`/`describeNode`/`buildPath` с усечением пути по бюджету/`navigationState`, jsdom-≈100%). Общий UI — `src/ui/inspection`: хук `useInspectedNode` (единственный носитель общего потока pick/navigate/collect/session/teardown/клавиатуры — устранил дублирование по 5 фичам) + компоненты `HierarchyNav` и `BoxModelDiagram`. **`HierarchyNav` (редизайн UI/UX) — единая «шапка осматриваемого узла»** для всех `inspector-*`: подсвеченный селектор `tag`/`#id`/`.class` + бейдж размеров `W × H`, breadcrumb в одну прокручиваемую строку (`aria-current`, клик → `ancestorAtDepth`) и компактный степпер (родитель ⌃ / первый ребёнок ⌄ / соседи `‹ n/m ›`, disabled по `canAscend`/`canDescend`/границам соседей; клавиатурные подсказки — в `title`/`aria`, не отдельным абзацем); pin сверху (`position: sticky`), чтобы контекст узла не терялся при прокрутке. **`BoxModelDiagram`** — общая визуализация вложенных слоёв `margin → border → padding → content` с числами сторон (в стиле DevTools, палитра дизайн-системы): у «Инспектора элемента» реконструируется из плоской группы `boxModel` + геометрии border-box, у «Линейки» (режим box) — из структурного `BoxModel`; форматтер единиц (px/rem) инъектируется. Превью инспекторов в обычной вкладке — виртуальное DOM-дерево `_preview/inspection-demo.ts` (dev-only, отвечает на инспекционные RPC). Деградация без исключений: нет якоря → `null`, невозможный шаг → текущее состояние без смены якоря, «умерший» узел (SPA) → безопасный `null`; зажатая стрелка коалесится (single-flight). Вне scope (бэклог TASK-053): Shadow DOM/iframe/псевдоэлементы, hover-drill, tree-view-панель.

**Живой режим инспекции курсором (TASK-056, ADR-0050).** «Инспектор элемента»/probe включает **persistent inspect-mode** (DevTools/Vue-DevTools-паритет): курсор непрерывно подсвечивает элемент под собой, а клик по вложенному **проваливает внутрь**, не выходя из режима. Так как шина строго request→один-response (push-канала content→панель нет), модель — **персистентная live-сессия в content-хосте + pick-loop в хуке**: host держит смонтированный оверлей, `cursor: crosshair`, `mousemove`→hover-подсветку и обработчики `click`/`Esc` (capture на `document`), а `inspection/pickLive` резолвится на очередном клике снимком узла (попутно `lastPicked = target`), оставляя сессию смонтированной. Панель ставит `state`, пересобирает `collect` и **сразу пере-вооружает** `pickLive` — оверлей/crosshair/`mousemove` не пересоздаются, поэтому **flicker между кликами отсутствует** (подсветка под курсором принадлежит сессии, а не отдельному запросу). Буфер последнего клика исключает потерю быстрого повторного клика между резолвом и пере-вооружением. Оверлей рисует **два состояния**: `locked` (сплошной бокс выбранного узла) и `hover` (пунктир/светлее — под курсором); `navigate`/стрелки обновляют `locked` — клавиатура и курсор живут в одном оверлее. Выход — `Esc`/`inspection/pickLiveStop`/session-token: ожидающий `pickLive` резолвится `null`, панель трактует это как «выйти из live, **сохранив** узел» (степпер `HierarchyNav` остаётся для **подъёма** к перекрытому родителю и переходов по соседям — курсором в закрытого детьми родителя не попасть). Обратная подсветка панель→страница (наведение/фокус на breadcrumb-crumb) переиспользует `inspection/highlight` (по селектору) — новый RPC не вводится. Одноразовый `inspection/pick` (ruler A/B, пипетка палитры) не тронут — live аддитивен и включён только для probe. Полное закрытие (`inspection/teardown`/`pagehide`) снимает оверлей и забывает якорь; выход из live — нет.

**Content-хост.** `content/inspection/*`: приёмник (`installInspectionHost` поверх `installRouter`/`runtimeTransport`), реестр сборщиков (`registerInspector(id, collector)`), общий element picker (`event.target`, `Esc`-отмена), оверлей-хост на Shadow DOM (`closed`, ADR-0021) — не мутирует DOM/стили страницы, полный teardown по `inspection/teardown`/`pagehide`.

**Примитивы.** `shared/inspection/dom.ts` (чистые, ~100% покрытие): `walk(root, {budget, exclude, skipHidden})` (обход с бюджетом узлов, исключение своего оверлея), `isInspectableElement` — **единый предикат «значимости»** для обхода и навигации (оверлей `[data-qatb-overlay]`, служебные теги, `display:none`; один источник правил, ADR-0049), `parseColor`/`toRgba`/`relativeLuminance`/`contrastRatio` (WCAG 2.1), `effectiveBackground`/`blend` (композиция фонов с alpha). WCAG-математика лежит здесь — общий фундамент контраста и палитры.

**Домены инспекторов — в shared, не в фичах.** Доменные модули конкретных инспекторов (`shared/inspection/{contrast,palette,fonts,props}/{logic,collector,types,catalog}.ts`, TASK-014…016, TASK-054) живут в shared рядом с `dom.ts`, а не в `features/`. Причина — fitness-инвариант §12.1: content-бандл (`content/inspection/index.ts`) обязан импортировать сборщики и зарегистрировать их (`registerInspector`), но ядру/бандлу запрещено зависеть от конкретных фич. Поэтому фича держит только UI-поверхность (`ui.tsx`/`settings.ts`/`i18n`), а `logic`/`collector`/`types` — общий инспекционный слой. Сборщик — чистая `(root) => сериализуемые данные`, пригодная для IIFE-бандла (внутри только `shared/inspection/dom`).

**Эталонный потребитель.** `features/inspector-probe` («Инспектор элемента») проверяет слой end-to-end (side panel → брокер прав → инъекция → пикер → оверлей → RPC → навигация) и снимает **курируемый computed-профиль** выбранного узла (TASK-054): сборщик `shared/inspection/props/collector.ts` под тем же id `'probe'` возвращает сгруппированные пары «свойство: значение» из единого каталога (`props/catalog.ts` — источник правды по группам/allow-list атрибутов/правилу фильтра шума), плюс вычисленные удобства для QA — эффективный фон и контраст текст/фон (переиспользуя `effectiveBackground`/`contrastRatio` из `dom.ts`, без второго расчёта) и геометрию box. Панель рисует секции со свотчами у цветов, строкой контраста с меткой WCAG, фильтром и копированием; профиль пересчитывается на каждый шаг навигации через авто-`collect` хука `useInspectedNode` (TASK-052). Результат валидируется `ElementPropsSchema` на UI-границе. Редактирование свойств — вне scope (домен `dom-override`).

**Matched CSS rules / каскад (TASK-055, ADR-0052).** Тот же сборщик `'probe'` аддитивно отдаёт **снимок совпавших CSS-правил** узла (поле `rules: MatchedRulesResult | null` в `ElementProps`): какое правило задало свойство, specificity `(a,b,c)`, порядок каскада, что перекрыто, из какого источника (стайлшит/inline). Добывается **чистым обходом CSSOM** (`shared/inspection/rules/{specificity,collector,types}.ts`), а НЕ через CDP `CSS.getMatchedStylesForNode`/`debugger` — least-privilege (без install-warning), работает при ОТКРЫТОМ DevTools, канон слоя и тестируемость (ADR-0052). `document.styleSheets` → рекурсивный обход `cssRules` (grouping-правила `@media`/`@supports`/`@layer` — по применимости через `matchMedia`/`CSS.supports`) → матч через `el.matches(selectorText)` (**источник истины**; specificity — только для упорядочивания) → атрибуция победителя по тому же `PROP_CATALOG`, что и профиль (`origin → @layer → specificity → source-order`, `!important` инвертирует). Inline-`style` — синтетическое правило origin `inline`, строго как разобранные CSS-пары каталога (приватность; согласовано с denylist `style`/`value`). Границы сред соблюдены: наружу идёт сериализуемый `MatchedRulesResult`, `CSSRule`-объекты не пересекают границу. Нового RPC/id сборщика/сообщения/права **не вводится** — расширяется форма `data` того же `inspection/collect`. Честные ограничения CSSOM **маркируются в UI** (не замалчиваются): нечитаемые cross-origin листы (`SecurityError` на `cssRules`) → счётчик + плашка «N внешних таблиц недоступны (CORS)»; UA-стили и точные номера строк в `.css` недоступны — помечены как разрыв с DevTools (добор — opt-in «глубокий каскад» на CDP, бэклог). Панель `inspector-probe` рисует секцию «Правила / Каскад» (селектор + бейдж specificity + источник/медиа/слой + объявления, перекрытые — зачёркнуты) и подпись-атрибуцию «задано правилом …» у свойств профиля.

**Приватность.** Слой не делает внешних сетевых вызовов; оверлей/сборщики не отправляют содержимое страницы никуда, кроме UI расширения. Host-доступ — постоянный optional (`*://*/*`, http/https), запрашивается по требованию под жестом (ADR-0022): `activeTab` не годится, т.к. не переживает переключение вкладок в side panel.

**MAIN-world оверрайды и подмена заголовков (TASK-019, ADR-0026).** Эмуляция окружения — второй, отличный от ISOLATED-хоста, путь инъекции. `features/environment` подменяет JS-API страницы (`navigator`/`Intl`/`geolocation`) инъекцией **чистой самодостаточной функции** в MAIN-world через платформенный `scriptingMain.run(tabId, func, args)` (`executeScript({ world: 'MAIN', func, args })`) — без второго IIFE-бандла: конфиг едет аргументом (Chrome сериализует `func.toString()`, поэтому `overrides.ts` использует только аргумент + глобалы, состояние — на `window`). Заголовки (`User-Agent`/`Accept-Language`) подменяются на сетевом уровне через `declarativeNetRequest` **session-rules**, ограниченные `tabId` (эфемерны, без персиста). Оркестрация — background-хендлеры `environment/apply|clear` (адресат `background`, не `content`: DNR/executeScript доступны только из SW) с in-memory реестром активных вкладок: ре-инъекция MAIN-оверрайдов при навигации (`tabEvents.onUpdated{loading}`), снятие правил при закрытии (`tabEvents.onRemoved`). `chrome.*` — только в seam (`platform`: `declarativeNetRequest`, `scriptingMain`, `tabs.navigate`, `tabEvents`). Честное ограничение: полноценный TZ-override без CDP невозможен — покрываем `Intl`/`getTimezoneOffset`.

**Разделяемая сессия перехвата сети (ADR-0042).** MAIN-перехватчик fetch/XHR (мок сети, TASK-022) — тоже SW-оркеструемый MAIN-путь, но его нужны СРАЗУ ДВЕ фичи: «Мок сети» (правила подмены) и «Экспорт бага» (только лог). Чтобы они не затирали и не убивали сессию друг друга, жизненным циклом перехватчика владеет **разделяемая сессия с подсчётом потребителей** — `shared/inspection/network/capture-session.ts`, `createNetworkCaptureSession<Rule, Entry>` (generic, `chrome.*`-операции инъектируются как зависимости — testable без Chrome). Перехватчик жив, пока есть хотя бы один потребитель (токен `'mock'`/`'observer'`); действующие правила — объединение их вкладов (лог всегда, мокинг — оверлей); ре-инъекция при навигации и teardown — внутри сессии. Единственный инстанс создаёт владелец движка (фон `mock-network`, с реальным `installMockInterceptor`/`clearMockInterceptor`/`readMockLog`); другие фичи потребляют через глобальные контракты `mock/observe` / `mock/observeStop` (fitness §12.1 — без импорта фичи). CDP-транспорт (ADR-0038) — отдельный mock-only путь. Это тот же приём «shared-инфраструктура + реюз через контракт», что и у инспекционного слоя, но для SW-стороны.

---

## 8b. Откреплённая плавающая панель (TASK-062, ADR-0053)

**Третья точка монтажа `QASurface`** — перетаскиваемый оверлей на самой странице, в дополнение к popup и side panel (те не трогаются). Снимает ограничение transient-popup (закрытие на `blur`): панель персистентна, её можно держать открытой рядом с проверяемым элементом и двигать по вьюпорту. Переиспользует foundation инъекции §8a.

**Состав.** `floating-panel/open` (контракт `shared/panel/messages.ts`, `target: 'background'`) из хедера popup/side panel под жестом → `background/panel.ts` → обобщённый `background/inject.ts` (`ensureContentScript`, вынесен из инспекции без смены поведения; параметризован именем бандла + опциональным ping'ом) инъектирует `content-panel.js` в активную вкладку. Обёртка `content/panel/*` самодостаточна: `frame.ts` строит **closed-Shadow-DOM хост** (`[data-qatb-panel]`, max z-index, CSP-safe инлайн, `all: initial`) с drag-handle заголовком (свернуть/закрыть) и cross-origin `<iframe>` на extension-страницу `src/panel/index.html#<nonce>`, рендерящую `QASurface variant="panel"`; `drag.ts` — Pointer Events + `setPointerCapture` + `touch-action: none` + `transform`-позиционирование + мягкий clamp (на экране всегда весь заголовок) + reclamp на `resize`; `host.ts` — монтаж/teardown, guard-флаг `window.__qatb_panel__` (идемпотентность, повторное открытие → `reopen`), persist позиции/свёрнутости/ширины (`shared/panel/settings.ts`, namespace `floating-panel` поверх `chrome.storage.local`), `pagehide`-teardown, восстановление позиции при монтаже.

**RPC к странице не меняется.** iframe — extension-контекст, говорит с background тем же `chrome.runtime`-bus, что popup/side panel; инспектор и прочие инструменты внутри панели работают через существующий `installInspectionForwarding` → `tabs.sendMessage(tabId)` → content-хост в топ-фрейме. Обёртка НЕ поднимает свой runtime-роутер (не конфликтует со вторым роутером в isolated-world); координация обёртка↔iframe — только `window.postMessage` с per-mount крипто-nonce (в `#hash` URL), строгая zod-валидация с обеих сторон (`shared/panel/protocol.ts`), сообщения без/с чужим nonce игнорируются. Мост iframe-стороны — `src/panel/bridge.ts` (`PanelBridge`): шлёт `ready` (иначе обёртка по дедлайну уходит в CSP-фолбэк) и слушает `state`.

**`variant="panel"` в `QASurface`.** Персистентна, поэтому `PANEL_ONLY`-инструменты (живой инспектор и т.п.) в ней разрешены (гейт `popupBlocked` завязан строго на `variant === 'popup'`); аффорданс «Открепить на страницу» в самой панели скрыт (оконный chrome — свернуть/закрыть — в обёртке, работает даже при CSP-фолбэке). Инспектор исключает `[data-qatb-panel]` из обхода/пикера — единый селектор `IGNORED_UI_SELECTOR` в `shared/inspection/dom.ts` (рядом с `[data-qatb-overlay]`), чтобы панель не «видела сама себя».

**Least-privilege.** Новых `permissions`/`host_permissions` нет — переиспользуются optional `scripting` + host из брокера. `src/panel/index.html` объявлен в `web_accessible_resources` (`use_dynamic_url: true`, `matches: ['*://*/*']`) — это **декларация, не право**, install-warning не поднимает. Страница собирается явным входом в `vite.config.ts` (как offscreen/recorder), бандл `content-panel.js` — через обобщённый `scripts/build-content.mjs`.

**Деградация при строгой CSP** (`frame-src`/`frame-ancestors` блокирует фрейминг extension-страницы): обёртка детектирует по таймауту `ready` и показывает локализованный фолбэк **внутри себя** (контрол закрытия под рукой), не оставляя битого iframe. closed Shadow DOM недоступен Playwright'у, поэтому drag/clamp/collapse закрыты юнитами (синтетические Pointer Events / фейковый DOM), а e2e (`tests/e2e/floating-panel.spec.ts`) проверяет инъекцию/персист/персистентность-клика/идемпотентность/DOM-неизменность/teardown/CSP-фолбэк.

---

## 9. Состояние, хранилище и cross-feature данные

- Локальное UI-состояние — сигналы Preact.
- Персист (настройки, пресеты) — пакет `shared/storage/**` над `chrome.storage.local`: типобезопасно, версионируемо, с миграциями и фолбэком на дефолты при повреждении (TASK-005, ADR-0016). Неймспейсинг ключей по фичам: `qatb:v<schemaVersion>:<namespace>:<key>`.

### Storage & Settings (TASK-005)

Прямое обращение к `chrome.storage.local` из фич **запрещено** — только через `shared/storage`. Слой строго типизирован, валидирует чтение через zod (fallback на дефолты, `decode` не бросает), применяет миграции схемы и **не** перезаписывает хранилище на `get()` (безопасность при даунгрейде расширения).

```ts
// features/random-numbers/settings.ts
import { z } from 'zod';
import { defineFeatureSettings, createSettingsBinding } from '@/shared/storage';

const schema = z.object({ min: z.number(), max: z.number(), last: z.number().optional() });
export const rnSettings = defineFeatureSettings({
  namespace: 'random-numbers', // = имя директории фичи (конвенция)
  schema,
  defaults: { min: 0, max: 100 },
});
export const rnBinding = createSettingsBinding(rnSettings); // синглтон на namespace
```

```tsx
// в компоненте — реактивно через signal
const s = useSettings(rnBinding);
s.value.value.min; // чтение (подписка); s.update({ min: 1 }) — запись
```

- **Слои:** `keys` (ключи `qatb:v<n>:<ns>:<key>`), `codec` (zod-декод/энкод, тотальный `decode`), `schema/*` + `migrations` (версии + чистые миграции, `runMigrationsWith`), `storage-area` (сменная area: `createMemoryArea` для тестов / `createChromeLocalArea` через адаптер платформы), `settings` (`defineFeatureSettings`, `appSettings`), `preact/useSettings` (signal-биндинг).
- Это конкретная реализация версионируемой сериализации для `kind: 'settings'` (ADR-0016): `__v` в блобе, реестр миграций в `migrations.ts`. Общий `Envelope<K,T>`/`shared/serialization.ts` для экспортируемых артефактов (моки R2, bug-state R3) вводятся отдельно и переиспользуют тот же подход к версиям.
- Синк между устройствами (`chrome.storage.sync`) — P2: в `storage-area.ts` оставлена закомментированная точка расширения `createChromeSyncArea`.
- **Cross-feature шина событий (`shared/events.ts`).** Дифференциатор PRD — «пресеты между инструментами» (генератор питает автозаполнение форм). Фичи обмениваются данными не через прямые импорты друг друга, а через типизированный pub/sub. Интерфейс `AppEvents` открыт для расширения тем же declaration merging, что и сообщения:

  ```ts
  declare module '@/shared/events' {
    interface AppEvents {
      'presets:dataset:changed': { presetId: string };
    }
  }
  // издатель
  emit('presets:dataset:changed', { presetId });
  // подписчик (форма-автозаполнение)
  on('presets:dataset:changed', ({ presetId }) => reloadPreset(presetId));
  ```

  Так фича «Формы» потребляет пресеты фичи «Генераторы» без связывания на неё по коду — обе зависят только от контракта события.

---

## 10. Сериализация и версионирование данных

Единый конверт для всех сохраняемых/экспортируемых/шарящихся артефактов — настройки, пресеты, будущие сценарии моков (R2) и «экспорт состояния бага» (R3):

```ts
export interface Envelope<K extends string, T> {
  kind: K;               // 'settings' | 'mock-scenario' | 'bug-state' | ...
  schemaVersion: number; // версия схемы данного kind
  data: T;
}
```

`shared/serialization.ts` предоставляет `pack`/`unpack` с реестром миграций по `kind` (аналогично storage-миграциям). Любой формат «на экспорт наружу» обязан иметь `schemaVersion` и миграции — тогда старые файлы/шаринги остаются читаемыми после эволюции схемы, и это не потребует переписывания импорта.

---

## 11. Безопасность и приватность

- Ядро — **offline**: отсутствие сетевых вызовов проверяется в CI (запрет `fetch`/`XMLHttpRequest` в ядре линт-правилом/тестом). Будущий мок сети — явно изолированный модуль с отдельными правами, не нарушающий инвариант для остального ядра.
- Криптостойкая случайность (`crypto.getRandomValues`) для всех генераторов тест-данных; для хэшей — `crypto.subtle`.
- CSP расширения — строгий; никаких удалённых скриптов/eval.
- Права по минимуму и по требованию (§8); каждое право документируется с обоснованием.
- Мост MAIN↔ISOLATED валидирует и фильтрует сообщения (сигнатура-маркер, `event.source`), чтобы страница не могла инжектировать поддельные команды в расширение.
- Никакой телеметрии по умолчанию.

---

## 12. Качество

- Порог покрытия ≥ 80% (ветки/строки/функции), чистая логика — близко к 100%.
- Type-aware ESLint, Prettier, строгий tsconfig; направление импортов enforce'ится `no-restricted-imports`.
- **Architecture-fitness тесты.** Автотесты, охраняющие инвариант расширяемости: (1) ни один файл вне `src/features/<f>/` не импортирует конкретную фичу; (2) `logic.ts` не импортирует Preact/`platform`/Chrome; (3) каждый зарегистрированный `id`/`message type` уникален; (4) все `message type` из реестра имеют парную response-схему; (5) `chrome.*` — только в `src/platform` и `shared/messaging/transports.ts`; (6) фича с content-адресованными сообщениями (`target: 'content'`) декларирует `content: { world, injectOn }` (контракт инъекции инспекционного слоя, TASK-013). Ломается — значит фича «протекла» мимо контракта.
- E2E на реально собранном расширении (Playwright), включая путь content↔background для инспектора.
- Все проверки — гейты в CI и в pre-commit/pre-push хуках.

Полные соглашения — в [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 13. Чек-лист «добавить новую фичу» (проверка инварианта)

Что **можно** трогать при новой фиче:

- [x] Создать `src/features/<feature>/**` (logic, ui, messages, handlers, settings, i18n, index, тесты).
- [x] Добавить одну строку импорта в `src/features/index.ts` (барель саморегистрации).

Что трогать **не нужно** (если приходится — это сигнал о протечке архитектуры, чинить контракт, а не фичу):

- [ ] `background/*` — хендлеры подключаются из дескриптора.
- [ ] `shared/messaging/contract.ts` — расширяется declaration merging из фичи.
- [ ] `manifest.config.ts` — уже выданные права запрашиваются брокером в рантайме. **Исключение:** фича, которой нужно **новое** optional-право, добавляет его в `optional_permissions`/`optional_host_permissions` (плюс строку в `PERMISSIONS.md`) — сам объект права обязан существовать в манифесте, чтобы брокер мог его запросить (напр. TASK-013 добавил `scripting` + host `*://*/*` в `optional_host_permissions`, ADR-0022).
- [ ] `i18n/ru.ts`/`en.ts` — фрагменты подмешиваются из дескриптора.
- [ ] `popup/App.tsx`, реестр, shell-навигация — рендерятся из реестра.
- Фича, инъектирующая content-скрипт, дополнительно: помечает свои сообщения `target: 'content'`, декларирует `content: { world, injectOn }` и (при своём content-бандле) подключается к сборке инъектируемого артефакта.

---

## 14. Дорожная карта архитектуры

Первая волна (каркас + простейшие popup-фичи: генераторы, декодеры) покрыта TASK-001…012 и использует лишь часть контрактов (реестр, storage, сообщения). Инспектор страницы (R1.1), эмуляция окружения и формы (R1.1), мокинг сети (R2), командные фичи и облачный синк (R3) добавляются в следующих волнах и **опираются на уже заложенные** абстракции: content/MAIN-world мост (§6), брокер прав (§8), cross-feature события (§9), версионированную сериализацию (§10). Для мока — гибридная стратегия перехвата (инъекция-перехватчик по умолчанию + опциональный CDP, PRD §9). Заложение этих контрактов до старта кода — сознательное решение ради инварианта расширяемости (§1).

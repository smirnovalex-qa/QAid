/**
 * Точка входа инъектируемого content-хоста инспекции (ISOLATED world, TASK-013).
 *
 * Инъектируется по требованию менеджером инъекции (`background/inspection.ts`)
 * через `chrome.scripting`, а не статическими `content_scripts` (ADR-0020,
 * least-privilege). Идемпотентность — guard-флаг `window.__qatb_inspection__`:
 * повторная инъекция не плодит слушатели/оверлеи.
 *
 * Импорт `@/shared/inspection/messages` (side-effect) регистрирует zod-схемы
 * инспекционных сообщений в реестре content-реалма — иначе роутер не провалидирует
 * входящий запрос.
 */
import '@/shared/inspection/messages';
import { installInspectionHost, registerInspector } from './host';
import { PROP_INSPECTOR_ID, collectElementProps } from '@/shared/inspection/props/collector';
import { CONTRAST_INSPECTOR_ID, collectContrast } from '@/shared/inspection/contrast/collector';
import { PALETTE_INSPECTOR_ID, collectPalette } from '@/shared/inspection/palette/collector';
import { FONTS_INSPECTOR_ID, collectFonts } from '@/shared/inspection/fonts/collector';
import { RULER_INSPECTOR_ID, collectBoxModel } from '@/shared/inspection/ruler/collector';
import { FORMS_INSPECTOR_ID, collectForms } from '@/shared/inspection/forms/collector';
import { DEFECTS_INSPECTOR_ID, collectDefects } from '@/shared/inspection/defects/collector';
import { SNAPSHOT_INSPECTOR_ID, collectSnapshot } from '@/shared/inspection/snapshot/collector';
import { installFormsContentHost } from '@/shared/inspection/forms/filler';
import { installStorageContentHost } from '@/shared/inspection/storage/web-storage';
import { installIdbContentHost } from '@/shared/inspection/idb/host';
import { installCacheContentHost } from '@/shared/inspection/cache/host';
import { installDomOverrideContentHost } from '@/shared/inspection/dom-override/applier';
import { installScreenshotScrollHost } from '@/shared/inspection/screenshot/scroll-host';
import { installMeasureToolHost } from './measure-tool';
import { installScreenshotEditorHost } from './screenshot-editor';

declare global {
  interface Window {
    __qatb_inspection__?: boolean;
  }
}

if (!window.__qatb_inspection__) {
  window.__qatb_inspection__ = true;

  // Инспектор элемента (TASK-013 → TASK-054): курируемый computed-профиль узла под
  // пикером (группы «свойство: значение» + эффективный фон/контраст + геометрия).
  // Id остаётся `'probe'` — обратная совместимость контракта `inspection/collect`;
  // авто-`collect` хука пересчитывает профиль на каждый шаг навигации (TASK-052).
  registerInspector(PROP_INSPECTOR_ID, (el) => collectElementProps(el));

  // Реальные инспекторы R1.1 (TASK-014…016). Сборщики живут в shared-слое инспекции
  // (`@/shared/inspection/<n>/collector`, рядом с `dom.ts`), а не в фичах: ядро/бандл
  // не должны зависеть от конкретных фич (fitness §12.1). Чистые `(root) => данные`
  // (внутри только `@/shared/inspection/dom`), пригодные для IIFE-бандла. Оборачиваем
  // в один аргумент под контракт `InspectorCollector`.
  // Запускаются и страничным `inspection/scan` (root — `document.body`), и
  // поэлементным `inspection/collect` (root — выбранный пикером узел).
  registerInspector(CONTRAST_INSPECTOR_ID, (el) => collectContrast(el));
  registerInspector(PALETTE_INSPECTOR_ID, (el) => collectPalette(el));
  registerInspector(FONTS_INSPECTOR_ID, (el) => collectFonts(el));
  // Box-model выбранного элемента для линейки (TASK-018); свободный drag — отдельный
  // инструмент оверлея (ниже, в inspection-хосте), геометрия — из shared/ruler/logic.
  registerInspector(RULER_INSPECTOR_ID, (el) => collectBoxModel(el));
  // Аудит форм (TASK-020): сборщик модели форм для страничного `scan`.
  registerInspector(FORMS_INSPECTOR_ID, (el) => collectForms(el));
  // Детектор дефектов (TASK-024): битые ссылки/alt/data-testid/дубли id и пр.
  registerInspector(DEFECTS_INSPECTOR_ID, (el) => collectDefects(el));
  // Снимок состояния страницы для snapshot-diff (TASK-028): структура + курируемые
  // стили/атрибуты/текст. Питается страничным `scan` (root — document.body).
  registerInspector(SNAPSHOT_INSPECTOR_ID, (el) => collectSnapshot(el));

  // Мутационные content-хосты фич (TASK-017/020): регистрируют свои `storage/*` и
  // `forms/*` хендлеры в общей шине. Свой роутер НЕ поднимают — его ставит
  // `installInspectionHost()` ниже (единый handler-map, порядок регистрации не важен).
  installStorageContentHost();
  // IndexedDB и Cache Storage (TASK-031): свои `idb/*` и `cache/*` хендлеры в общей
  // шине (обход курсорами/Cache API с бюджетом); роутер не поднимают.
  installIdbContentHost();
  installCacheContentHost();
  installFormsContentHost();
  // Косметическая DOM-подмена (TASK-023): свои `domOverride/*` хендлеры в общей шине;
  // роутер не поднимает — его ставит `installInspectionHost()` ниже.
  installDomOverrideContentHost();
  // Склейка полной страницы для скриншота (TASK-027): `screenshot/*` управление
  // прокруткой/метриками; роутер не поднимает (захват кадров — на стороне расширения).
  installScreenshotScrollHost();
  // Свободная линейка (TASK-033): интерактивный drag-измеритель поверх собственного
  // оверлея; свои `inspection/measure*` хендлеры в общей шине, роутер не поднимает.
  installMeasureToolHost();
  // In-page редактор скриншота (TASK-035): «заморозка» кадра на собственном оверлее,
  // выделение региона + аннотации на месте; хендлер `screenshot/editInPage` в общей
  // шине, роутер не поднимает (кадр снимает расширение и передаёт по RPC).
  installScreenshotEditorHost();

  installInspectionHost();
}

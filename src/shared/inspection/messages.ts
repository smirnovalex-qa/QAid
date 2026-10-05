/**
 * Инспекционный RPC (TASK-013) — контракты «UI → content-скрипт активной вкладки»
 * поверх федеративного протокола (ADR-0010/0012). Все запросы адресованы
 * `content`: background не держит для них доменных хендлеров, а генерически
 * форвардит в целевую вкладку (`background/inspection.ts`), гарантируя инъекцию.
 *
 * Каждый запрос несёт `tabId` — адрес вкладки, куда форвардить (background берёт
 * его из payload). Валидация zod — на обеих границах (UI и content).
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/** Снимок геометрии элемента. */
export const ElementRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/** Сериализуемый снимок выбранного элемента (см. [types.ts]). */
export const PickedElementSchema = z.object({
  tagName: z.string(),
  id: z.string().nullable(),
  classNames: z.array(z.string()),
  selector: z.string(),
  rect: ElementRectSchema,
});

/**
 * Расширенный снимок узла для навигации по иерархии (TASK-052) — аддитивно расширяет
 * {@link PickedElementSchema} контекстом положения в дереве. Обратная совместимость:
 * содержит все поля `PickedElement`, поэтому старые потребители `inspection/pick` не ломаются.
 */
export const NodeDescriptorSchema = PickedElementSchema.extend({
  childElementCount: z.number().int().nonnegative(),
  siblingIndex: z.number().int(),
  siblingCount: z.number().int().nonnegative(),
  depth: z.number().int().nonnegative(),
});

/** Состояние навигации по якорю (TASK-052): узел, breadcrumb, флаги доступности шагов. */
export const NavigationStateSchema = z.object({
  node: NodeDescriptorSchema,
  path: z.array(NodeDescriptorSchema),
  canAscend: z.boolean(),
  canDescend: z.boolean(),
});

/** Шаг навигации по DOM-иерархии (`ancestorAtDepth` дополняется полем `depth` запроса). */
export const NavigationStepSchema = z.enum([
  'parent',
  'firstChild',
  'nextSibling',
  'previousSibling',
  'ancestorAtDepth',
]);

/** База запроса к content: обязательный адрес вкладки. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/**
 * `inspection/ping` — проба живости content-хоста. Используется менеджером
 * инъекции напрямую (не через генерический форвардинг): отсутствие ответа —
 * сигнал, что скрипт надо инъектировать.
 */
export const InspectionPing = defineMessage(
  'inspection/ping',
  z.object({}),
  z.object({ ready: z.literal(true) }),
  { target: 'content' },
);

/**
 * `inspection/pick` — запустить общий element picker в целевой вкладке. Ответ —
 * снимок выбранного элемента или `null` (отмена по `Esc`). Content-хост
 * запоминает выбранный элемент как «якорь» для последующего `collect`.
 */
export const InspectionPick = defineMessage(
  'inspection/pick',
  TabTarget,
  // Аддитивное расширение (TASK-052): ответ — снимок узла + его `navigation`-состояние,
  // чтобы панель сразу отрисовала breadcrumb без лишнего round-trip. Форма остаётся
  // надмножеством `PickedElement`, поэтому существующие потребители (ruler A/B, palette
  // eyedropper) продолжают читать `selector`/`rect`/`tagName` из верхнего уровня.
  NodeDescriptorSchema.extend({ navigation: NavigationStateSchema }).nullable(),
  { target: 'content' },
);

/**
 * `inspection/pickLive` — включить/пере-вооружить ЖИВОЙ режим инспекции курсором
 * (TASK-056, ADR-0050). В отличие от одноразового `inspection/pick`, content-хост
 * держит ПЕРСИСТЕНТНУЮ сессию: смонтированный оверлей, `cursor: crosshair` и
 * непрерывную подсветку под курсором. Каждый вызов резолвится на ОЧЕРЕДНОМ клике
 * снимком кликнутого (самого глубокого под курсором) узла + его `navigation`
 * (форма — надмножество `PickedElement`, как у `pick`, поэтому схема переиспользуется),
 * попутно двигая `lastPicked` на этот узел. Сессия при этом остаётся смонтированной —
 * панель немедленно пере-вооружает следующий `pickLive` без ремонтажа оверлея (нет
 * flicker). `null` — выход из режима (`Esc` на странице / `inspection/pickLiveStop` /
 * `inspection/teardown` / `pagehide`): последний осмотренный узел в панели сохраняется.
 */
export const InspectionPickLive = defineMessage(
  'inspection/pickLive',
  TabTarget,
  NodeDescriptorSchema.extend({ navigation: NavigationStateSchema }).nullable(),
  { target: 'content' },
);

/**
 * `inspection/pickLiveStop` — выйти из живого режима инспекции из панели (TASK-056):
 * останавливает персистентную сессию (снимает слушатели, возвращает курсор), а
 * ожидающий `inspection/pickLive` резолвит `null`. Отдельное сообщение по образцу
 * `inspection/measureStop`: `pickLive` — долгоживущий запрос, а `inspection/teardown`
 * полностью снимает оверлей и забывает якорь (здесь же оверлей/якорь сохраняются, чтобы
 * степпер `HierarchyNav` продолжал работать после выхода из live).
 */
export const InspectionPickLiveStop = defineMessage(
  'inspection/pickLiveStop',
  TabTarget,
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/**
 * `inspection/navigate` — навигация по DOM-иерархии текущего якоря (TASK-052, ADR-0049).
 * Stateful-команда: DOM-узел наружу не сериализуется, content-хост держит «текущий
 * элемент» (`lastPicked`) и двигает его по `resolveStep`, возвращая только снимок
 * состояния. Ответ — {@link NavigationStateSchema} нового узла; `null` — нет активного
 * якоря. Невозможный шаг → текущее состояние без смены якоря (идемпотентно).
 */
export const InspectionNavigate = defineMessage(
  'inspection/navigate',
  TabTarget.extend({
    step: NavigationStepSchema,
    depth: z.number().int().nonnegative().optional(),
  }),
  NavigationStateSchema.nullable(),
  { target: 'content' },
);

/**
 * `inspection/collect` — запустить именованный сборщик на последнем выбранном
 * элементе (якоре пикера). Ошибка «нет якоря»/«нет сборщика» — через error-конверт.
 */
export const InspectionCollect = defineMessage(
  'inspection/collect',
  TabTarget.extend({ inspectorId: z.string().min(1) }),
  z.object({ inspectorId: z.string(), data: z.unknown() }),
  { target: 'content' },
);

/**
 * `inspection/scan` — запустить именованный сборщик по всей странице (корень —
 * `document.body`), без предварительного выбора элемента пикером. Основной путь для
 * страничных инспекторов (контраст/палитра/шрифты, TASK-014…016): в отличие от
 * `collect`, не требует «якоря». Ответ — сериализуемый агрегат сборщика. Сборщик
 * может быть асинхронным (напр. дождаться `document.fonts.ready`) — хост его дожидается.
 */
export const InspectionScan = defineMessage(
  'inspection/scan',
  TabTarget.extend({ inspectorId: z.string().min(1) }),
  z.object({ inspectorId: z.string(), data: z.unknown() }),
  { target: 'content' },
);

/**
 * `inspection/highlight` — подсветить и проскроллить к узлу по CSS-селектору
 * (генерически, без состояния): хост находит `querySelector(selector)`, показывает
 * его прямоугольник в оверлее и делает `scrollIntoView`. Позволяет инспекторам
 * «клик по пункту списка → показать узел на странице» без переноса DOM-ссылок через
 * границу. Невалидный/не найденный селектор — `{ found: false }`, инструмент не падает.
 */
export const InspectionHighlight = defineMessage(
  'inspection/highlight',
  TabTarget.extend({ selector: z.string().min(1) }),
  z.object({ found: z.boolean() }),
  { target: 'content' },
);

/**
 * `inspection/teardown` — снять оверлей, отменить активный пикер, забыть якорь.
 * Приводит вкладку в исходное состояние (DOM страницы не мутируется).
 */
export const InspectionTeardown = defineMessage(
  'inspection/teardown',
  TabTarget,
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/** Точка в клиентских координатах (конец свободной мерки, TASK-033). */
const PointSchema = z.object({ x: z.number(), y: z.number() });

/** Результат свободного (drag) измерения — совпадает по форме с `DragMeasurement`. */
export const DragMeasurementSchema = z.object({
  dx: z.number(),
  dy: z.number(),
  width: z.number(),
  height: z.number(),
  length: z.number(),
  angleDeg: z.number(),
});

/**
 * `inspection/measure` — запустить интерактивную свободную линейку (TASK-033) в целевой
 * вкладке: пользователь тянет мышью мерку A→B поверх Shadow-DOM оверлея (DOM страницы
 * не мутируется). Ответ — концы мерки и итоговое измерение, либо `null` (отмена по
 * `Esc`/`inspection/measureStop`/вытеснение новым запуском). `snap`/`snapThreshold`
 * управляют примагничиванием концов к кромкам видимых элементов. Долгоживущий запрос —
 * резолвится по завершении drag (как `inspection/pick`).
 */
export const InspectionMeasure = defineMessage(
  'inspection/measure',
  TabTarget.extend({ snap: z.boolean(), snapThreshold: z.number() }),
  z.object({ a: PointSchema, b: PointSchema, measurement: DragMeasurementSchema }).nullable(),
  { target: 'content' },
);

/**
 * `inspection/measureStop` — отменить активную свободную линейку из панели (тот
 * `inspection/measure` резолвится `null`). Отдельное сообщение, т.к. `measure` —
 * долгоживущий запрос, а `inspection/teardown` принадлежит инспекционному хосту.
 */
export const InspectionMeasureStop = defineMessage(
  'inspection/measureStop',
  TabTarget,
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/** Все инспекционные контракты слоя — для регистрации в дескрипторе фичи. */
export const inspectionMessages = [
  InspectionPing,
  InspectionPick,
  InspectionPickLive,
  InspectionPickLiveStop,
  InspectionNavigate,
  InspectionCollect,
  InspectionScan,
  InspectionHighlight,
  InspectionTeardown,
  InspectionMeasure,
  InspectionMeasureStop,
];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'inspection/ping': {
      request: z.infer<typeof InspectionPing.request>;
      response: z.infer<typeof InspectionPing.response>;
    };
    'inspection/pick': {
      request: z.infer<typeof InspectionPick.request>;
      response: z.infer<typeof InspectionPick.response>;
    };
    'inspection/pickLive': {
      request: z.infer<typeof InspectionPickLive.request>;
      response: z.infer<typeof InspectionPickLive.response>;
    };
    'inspection/pickLiveStop': {
      request: z.infer<typeof InspectionPickLiveStop.request>;
      response: z.infer<typeof InspectionPickLiveStop.response>;
    };
    'inspection/navigate': {
      request: z.infer<typeof InspectionNavigate.request>;
      response: z.infer<typeof InspectionNavigate.response>;
    };
    'inspection/collect': {
      request: z.infer<typeof InspectionCollect.request>;
      response: z.infer<typeof InspectionCollect.response>;
    };
    'inspection/scan': {
      request: z.infer<typeof InspectionScan.request>;
      response: z.infer<typeof InspectionScan.response>;
    };
    'inspection/highlight': {
      request: z.infer<typeof InspectionHighlight.request>;
      response: z.infer<typeof InspectionHighlight.response>;
    };
    'inspection/teardown': {
      request: z.infer<typeof InspectionTeardown.request>;
      response: z.infer<typeof InspectionTeardown.response>;
    };
    'inspection/measure': {
      request: z.infer<typeof InspectionMeasure.request>;
      response: z.infer<typeof InspectionMeasure.response>;
    };
    'inspection/measureStop': {
      request: z.infer<typeof InspectionMeasureStop.request>;
      response: z.infer<typeof InspectionMeasureStop.response>;
    };
  }
}

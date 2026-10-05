/**
 * RPC-контракты склейки полной страницы (TASK-027) поверх федеративного протокола
 * (ADR-0010/0012). Все запросы адресованы `content`: background генерически
 * форвардит их в целевую вкладку, гарантируя инъекцию инспекционного бандла (как
 * `inspection/*` и `storage/*`). Каждый запрос несёт `tabId` — адрес форварда.
 *
 * Захват кадров идёт на стороне расширения через platform-seam
 * (`tabs.captureVisibleTab`); эти сообщения лишь управляют прокруткой страницы и
 * возвращают её метрики (высота документа/вьюпорта, DPR), чтобы UI построил план
 * склейки чистой логикой (`planFullPageStitch`).
 *
 * Валидация zod — на обеих границах (UI и content).
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/** База запроса к content: обязательный адрес вкладки. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/** Метрики страницы для планирования склейки. */
const PageMetrics = z.object({
  viewportW: z.number().nonnegative(),
  viewportH: z.number().nonnegative(),
  docH: z.number().nonnegative(),
  dpr: z.number().positive(),
});

/**
 * `screenshot/metrics` — снять метрики страницы (высота документа/вьюпорта, DPR,
 * ширина вьюпорта) и запомнить исходную прокрутку для последующего `reset`.
 */
export const ScreenshotMetrics = defineMessage('screenshot/metrics', TabTarget, PageMetrics, {
  target: 'content',
});

/**
 * `screenshot/scrollStep` — проскроллить окно к `scrollY` и вернуть фактические
 * метрики (браузер мог зажать прокрутку). UI captures кадр после ответа.
 */
export const ScreenshotScrollStep = defineMessage(
  'screenshot/scrollStep',
  TabTarget.extend({ scrollY: z.number().nonnegative() }),
  PageMetrics.extend({ scrollY: z.number().nonnegative() }),
  { target: 'content' },
);

/** `screenshot/reset` — вернуть прокрутку к исходной позиции (после склейки). */
export const ScreenshotReset = defineMessage(
  'screenshot/reset',
  TabTarget,
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/**
 * `screenshot/editInPage` — запуск in-page («заморозка экрана», TASK-035) редактора.
 * UI снимает кадр вьюпорта расширением (`captureVisibleTab`, device px) и передаёт его
 * dataURL + размеры content-оверлею, который «замораживает» экран, ведёт выделение и
 * аннотации на месте и сам экспортирует PNG (буфер/скачивание). Запрос долгоживущий
 * (как `inspection/pick`): резолвится терминальным статусом при закрытии оверлея.
 * Метрики вьюпорта/DPR оверлею передавать не нужно — он читает их у себя (`window`).
 */
const EditInPageResult = z.object({
  status: z.enum(['copied', 'downloaded', 'cancelled', 'unavailable']),
});

export const ScreenshotEditInPage = defineMessage(
  'screenshot/editInPage',
  TabTarget.extend({
    image: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    // Локализованные подписи тулбара/подсказок: панель владеет i18n (`t`), а
    // content-оверлей остаётся локале-агностичным. Отсутствующий ключ оверлей
    // подменяет встроенным английским дефолтом (graceful degradation).
    labels: z.record(z.string(), z.string()).optional(),
  }),
  EditInPageResult,
  { target: 'content' },
);

/** Все контракты склейки/in-page — для регистрации в дескрипторе фичи (`messages:`). */
export const screenshotMessages = [
  ScreenshotMetrics,
  ScreenshotScrollStep,
  ScreenshotReset,
  ScreenshotEditInPage,
];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'screenshot/metrics': {
      request: z.infer<typeof ScreenshotMetrics.request>;
      response: z.infer<typeof ScreenshotMetrics.response>;
    };
    'screenshot/scrollStep': {
      request: z.infer<typeof ScreenshotScrollStep.request>;
      response: z.infer<typeof ScreenshotScrollStep.response>;
    };
    'screenshot/reset': {
      request: z.infer<typeof ScreenshotReset.request>;
      response: z.infer<typeof ScreenshotReset.response>;
    };
    'screenshot/editInPage': {
      request: z.infer<typeof ScreenshotEditInPage.request>;
      response: z.infer<typeof ScreenshotEditInPage.response>;
    };
  }
}

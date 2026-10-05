/**
 * Контракты откреплённой плавающей панели (TASK-062) поверх федеративного протокола
 * (ADR-0010/0012). `floating-panel/open` адресован `background`: он под пользовательским
 * жестом (из хедера popup/side panel) инъектирует content-обёртку панели в целевую
 * вкладку (`background/panel.ts` → `ensureContentScript('content-panel.js')`). Обёртка
 * далее самодостаточна (монтирует iframe тела, drag, persist), поэтому отдельного
 * content-RPC к ней не нужно — тело панели (iframe) говорит с background тем же bus,
 * что popup/side panel.
 *
 * Валидация zod — на обеих границах (UI и background). Ошибки инъекции
 * (привилегированная страница, нет host-доступа) возвращаются типизированным `AppError`
 * с `messageKey` через error-конверт — тем же путём, что инспекционный слой.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/** Адрес вкладки, в которую инъектируется обёртка панели. */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/**
 * `floating-panel/open` — открепить поверхность на страницу: инъектировать content-обёртку
 * плавающей панели в целевую вкладку (идемпотентно; повторное открытие — фокус/разворачивание
 * существующей, не второй экземпляр). Ответ — `{ ok: true }`; отказ (служебная страница /
 * нет host-доступа) приходит error-конвертом с `messageKey`.
 */
export const FloatingPanelOpen = defineMessage(
  'floating-panel/open',
  TabTarget,
  z.object({ ok: z.literal(true) }),
  { target: 'background' },
);

/** Все контракты фичи плавающей панели — для регистрации в реестре сообщений. */
export const floatingPanelMessages = [FloatingPanelOpen];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'floating-panel/open': {
      request: z.infer<typeof FloatingPanelOpen.request>;
      response: z.infer<typeof FloatingPanelOpen.response>;
    };
  }
}

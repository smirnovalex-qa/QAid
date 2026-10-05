/**
 * Content-target контракты фичи «Формы» (TASK-020) поверх федеративного протокола
 * (ADR-0010/0012). Как и инспекционные сообщения (`inspection/*`), адресованы
 * `content`: background не держит доменных хендлеров, а генерически форвардит запрос
 * в целевую вкладку, гарантируя инъекцию content-хоста.
 *
 * Аудит форм НЕ вводит своих сообщений — он использует существующий `inspection/scan`
 * с инспектором `forms` (см. `collector.ts`) и `inspection/highlight` для перехода к
 * полю. Здесь только мутирующие действия над формой: заполнение и очистка.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/** База запроса к content: обязательный адрес вкладки (для форвардинга background'ом). */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/** Профиль автозаполнения (совпадает с `FillProfile`). */
const ProfileSchema = z.enum(['valid', 'boundary', 'empty', 'injection']);

/**
 * `forms/fill` — заполнить поля активной вкладки тест-данными выбранного профиля.
 * Опциональный `seed` даёт воспроизводимое заполнение (детерминированный RNG).
 * Ответ — число фактически заполненных полей (disabled/readonly/скрытые пропущены).
 * Автосабмит НЕ выполняется.
 */
export const FormsFill = defineMessage(
  'forms/fill',
  TabTarget.extend({ profile: ProfileSchema, seed: z.number().int().optional() }),
  z.object({ filled: z.number().int().nonnegative() }),
  { target: 'content' },
);

/**
 * `forms/clear` — очистить заполняемые поля активной вкладки (значения + события
 * фреймворков). Ответ — число очищенных полей.
 */
export const FormsClear = defineMessage(
  'forms/clear',
  TabTarget,
  z.object({ cleared: z.number().int().nonnegative() }),
  { target: 'content' },
);

/** Контракты фичи «Формы» — для регистрации в дескрипторе (`FeatureModule.messages`). */
export const formsMessages = [FormsFill, FormsClear];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'forms/fill': {
      request: z.infer<typeof FormsFill.request>;
      response: z.infer<typeof FormsFill.response>;
    };
    'forms/clear': {
      request: z.infer<typeof FormsClear.request>;
      response: z.infer<typeof FormsClear.response>;
    };
  }
}

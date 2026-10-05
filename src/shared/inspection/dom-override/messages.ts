/**
 * Content-target контракты фичи «Мок: DOM-подмена выделением» (TASK-023) поверх
 * федеративного протокола (ADR-0010/0012). Как и инспекционные/форменные сообщения,
 * адресованы `content`: background не держит доменных хендлеров, а генерически
 * форвардит запрос в целевую вкладку, гарантируя инъекцию content-хоста.
 *
 * Выбор элемента ведёт существующий пикер (`inspection/pick`, TASK-013) — своего
 * сообщения выбора здесь нет; тут только применение/снятие/список косметических
 * подмен над уже выбранными селекторами. Валидация zod — на обеих границах.
 */
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';

/** База запроса к content: обязательный адрес вкладки (для форвардинга background'ом). */
const TabTarget = z.object({ tabId: z.number().int().nonnegative() });

/** Сериализуемое описание косметической операции (discriminated union по `kind`). */
export const DomOverrideOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('replace-text'), text: z.string() }),
  z.object({ kind: z.literal('set-attribute'), name: z.string().min(1), value: z.string() }),
  z.object({ kind: z.literal('remove-attribute'), name: z.string().min(1) }),
  z.object({ kind: z.literal('hide') }),
  z.object({
    kind: z.literal('inject-content'),
    text: z.string(),
    repeat: z.number().int().positive(),
  }),
]);

/** Схема одной записи подмены (селектор + операция + активность). */
export const DomOverrideEntrySchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  label: z.string(),
  op: DomOverrideOpSchema,
  enabled: z.boolean(),
});

/**
 * `domOverride/apply` — реконсиляция полного набора активных подмен во вкладке:
 * хост откатывает прежде применённые, затем применяет переданные (со снятием снимка
 * для отката) и переигрывает их по DOM-мутациям. Ответ — число фактически
 * применённых записей (не найденный селектор пропускается).
 */
export const DomOverrideApply = defineMessage(
  'domOverride/apply',
  TabTarget.extend({ entries: z.array(DomOverrideEntrySchema) }),
  z.object({ applied: z.number().int().nonnegative() }),
  { target: 'content' },
);

/**
 * `domOverride/clear` — снять все подмены во вкладке: откатить DOM в исходное
 * состояние, отключить наблюдатель мутаций.
 */
export const DomOverrideClear = defineMessage(
  'domOverride/clear',
  TabTarget,
  z.object({ ok: z.literal(true) }),
  { target: 'content' },
);

/** `domOverride/list` — селекторы фактически применённых сейчас подмен (для сверки). */
export const DomOverrideList = defineMessage(
  'domOverride/list',
  TabTarget,
  z.object({ selectors: z.array(z.string()) }),
  { target: 'content' },
);

/** Контракты фичи — для регистрации в дескрипторе (`FeatureModule.messages`). */
export const domOverrideMessages = [DomOverrideApply, DomOverrideClear, DomOverrideList];

declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'domOverride/apply': {
      request: z.infer<typeof DomOverrideApply.request>;
      response: z.infer<typeof DomOverrideApply.response>;
    };
    'domOverride/clear': {
      request: z.infer<typeof DomOverrideClear.request>;
      response: z.infer<typeof DomOverrideClear.response>;
    };
    'domOverride/list': {
      request: z.infer<typeof DomOverrideList.request>;
      response: z.infer<typeof DomOverrideList.response>;
    };
  }
}

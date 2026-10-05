/**
 * Рантайм-реестр zod-схем сообщений (ADR-0010).
 *
 * `defineMessage` кладёт схемы `request`/`response` в map по `type`; валидация на
 * границе среды идёт per-type-lookup — центральный `discriminatedUnion` не нужен.
 * Дубликат `type` — ошибка (инвариант расширяемости: типы уникальны).
 */
import type { ZodType } from 'zod';

/**
 * Куда адресован запрос по умолчанию:
 * - `background` — обрабатывается зарегистрированным background-хендлером (по
 *   умолчанию; так работают все фичи первой волны).
 * - `content` — предназначен content-скрипту активной вкладки. Background не
 *   держит для него доменного хендлера, а генерически форвардит в целевую вкладку
 *   (см. `background/inspection.ts`), предварительно гарантируя инъекцию скрипта.
 */
export type MessageTarget = 'background' | 'content';

export interface MessageDef<Req, Res> {
  type: string;
  request: ZodType<Req>;
  response: ZodType<Res>;
  target: MessageTarget;
}

/** Схема с стёртыми генериками — для хранения и передачи через границу дескриптора. */
export type AnyMessageDef = MessageDef<unknown, unknown>;

export interface DefineMessageOptions {
  /** Адресат запроса (по умолчанию `background`). */
  target?: MessageTarget;
}

const schemas = new Map<string, AnyMessageDef>();

export function defineMessage<Req, Res>(
  type: string,
  request: ZodType<Req>,
  response: ZodType<Res>,
  options: DefineMessageOptions = {},
): MessageDef<Req, Res> {
  if (schemas.has(type)) throw new Error(`duplicate message type: ${type}`);
  const def: MessageDef<Req, Res> = {
    type,
    request,
    response,
    target: options.target ?? 'background',
  };
  schemas.set(type, def);
  return def;
}

/** Типы сообщений, адресованных content-скрипту (для генерического форвардинга). */
export function contentMessageTypes(): string[] {
  return [...schemas.values()].filter((d) => d.target === 'content').map((d) => d.type);
}

export function getMessageDef(type: string): AnyMessageDef | undefined {
  return schemas.get(type);
}

export function allMessageTypes(): string[] {
  return [...schemas.keys()];
}

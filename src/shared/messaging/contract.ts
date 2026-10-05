/**
 * Открытый контракт типов сообщений (ADR-0010, федеративный протокол).
 *
 * `MessageContracts` пуст by design и расширяется фичами через declaration
 * merging в их `messages.ts` — центральный union, который правила бы каждая
 * фича, отсутствует. Чтобы augmentation попал в граф компиляции, `messages.ts`
 * фичи должен быть достижим из барреля `features/index.ts`.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MessageContracts {}

export type AnyMessageType = Extract<keyof MessageContracts, string>;
export type RequestOf<T extends AnyMessageType> = MessageContracts[T]['request'];
export type ResponseOf<T extends AnyMessageType> = MessageContracts[T]['response'];

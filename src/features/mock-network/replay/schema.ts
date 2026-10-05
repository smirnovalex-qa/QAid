/**
 * Zod-схемы replay-модели (TASK-038). Держим zod ЗДЕСЬ (fitness §12.2 — чистая
 * `logic.ts` без zod) и переиспользуем как единый источник формы для сообщений
 * (`messages.ts`, контракт `mock/replay`) и настроек (`settings.ts`, история).
 * Аналогично `rules.ts`, но без побочных эффектов `defineMessage` — чтобы импорт
 * из настроек не регистрировал сообщения.
 */
import { z } from 'zod';
import type { HeaderPair, KeyValue, ReplayHistoryEntry, RequestSpec, ResponseMeta } from '../types';

export const KeyValueSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
}) satisfies z.ZodType<KeyValue, z.ZodTypeDef, unknown>;

export const HeaderPairSchema = z.object({
  key: z.string(),
  value: z.string(),
}) satisfies z.ZodType<HeaderPair, z.ZodTypeDef, unknown>;

export const RequestSpecSchema = z.object({
  method: z.string(),
  url: z.string(),
  query: z.array(KeyValueSchema),
  headers: z.array(KeyValueSchema),
  body: z.string(),
  bodyMode: z.enum(['none', 'raw', 'json']),
}) satisfies z.ZodType<RequestSpec, z.ZodTypeDef, unknown>;

export const ResponseMetaSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.array(HeaderPairSchema),
  body: z.string(),
  truncated: z.boolean(),
  sizeBytes: z.number(),
  durationMs: z.number(),
  url: z.string(),
}) satisfies z.ZodType<ResponseMeta, z.ZodTypeDef, unknown>;

export const ReplayErrorSchema = z.object({
  kind: z.enum(['network', 'timeout', 'too-large', 'aborted', 'bad-request']),
  message: z.string(),
});

/** Дискриминируемый результат отправки — ответ либо типизированный сбой. */
export const ReplayResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), response: ResponseMetaSchema }),
  z.object({ ok: z.literal(false), error: ReplayErrorSchema }),
]);

export const ReplayHistoryEntrySchema = z.object({
  id: z.string(),
  spec: RequestSpecSchema,
  at: z.number(),
  status: z.number().nullable(),
}) satisfies z.ZodType<ReplayHistoryEntry, z.ZodTypeDef, unknown>;

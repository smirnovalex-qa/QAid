/**
 * Конверт сообщений и его разбор. Через границу сред ходят только сериализуемые
 * plain-объекты: обычный конверт `{ type, payload, correlationId }` и конверт
 * ошибки `{ type: '__error__', error }` (см. [errors.ts]).
 */
import type { AppError } from '@/shared/errors';

/** Маркер-сигнатура для фильтрации `window.postMessage` в релее (ARCHITECTURE §11). */
export const MARKER = '__qatb__';
export const ERROR_TYPE = '__error__';

export interface Envelope {
  type: string;
  payload: unknown;
  correlationId: string;
}

export interface ErrorEnvelope {
  type: typeof ERROR_TYPE;
  error: AppError;
  correlationId?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function makeEnvelope(type: string, payload: unknown, correlationId: string): Envelope {
  return { type, payload, correlationId };
}

/** Разбирает входящий конверт запроса; конверт ошибки и мусор отбрасываются (`undefined`). */
export function parseEnvelope(raw: unknown): Envelope | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.type !== 'string' || raw.type === ERROR_TYPE) return undefined;
  if (typeof raw.correlationId !== 'string') return undefined;
  return { type: raw.type, payload: raw.payload, correlationId: raw.correlationId };
}

export function errorEnvelope(error: AppError, correlationId?: string): ErrorEnvelope {
  return correlationId === undefined
    ? { type: ERROR_TYPE, error }
    : { type: ERROR_TYPE, error, correlationId };
}

export function isErrorEnvelope(raw: unknown): raw is ErrorEnvelope {
  return isRecord(raw) && raw.type === ERROR_TYPE && isRecord(raw.error);
}

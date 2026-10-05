/**
 * Обёртки обмена (ADR-0010): типобезопасный клиент `sendMessage`, реестр
 * хендлеров `registerHandler` и единая точка приёма `installRouter` поверх
 * сменных транспортов. Валидация — по рантайм-реестру zod-схем.
 */
import type { AnyMessageType, RequestOf, ResponseOf } from './contract';
import { getMessageDef } from './registry';
import { errorEnvelope, isErrorEnvelope, makeEnvelope, parseEnvelope } from './envelope';
import type { Transport, MessageMeta } from './transports';
import { runtimeTransport } from './transports';
import { ok, err } from '@/shared/result';
import type { Result } from '@/shared/result';
import { appError, toAppError, AppErrorException } from '@/shared/errors';
import { logger } from '@/shared/logger';

/**
 * Клиент. Транспорт по умолчанию — runtime (UI/content → background).
 * Возвращает `Result`: ошибки не бросаются, а нормализуются в `AppError`.
 */
export async function sendMessage<T extends AnyMessageType>(
  type: T,
  payload: RequestOf<T>,
  transport: Transport = runtimeTransport(),
): Promise<Result<ResponseOf<T>>> {
  const def = getMessageDef(type);
  if (!def) return err(appError('NO_RECEIVER', `unknown type: ${type}`));

  const reqCheck = def.request.safeParse(payload);
  if (!reqCheck.success) return err(appError('VALIDATION', 'bad request', reqCheck.error.issues));

  try {
    const raw = await transport.send(makeEnvelope(type, reqCheck.data, crypto.randomUUID()));
    if (isErrorEnvelope(raw)) return err(raw.error);

    const parsed = parseEnvelope(raw);
    if (!parsed) return err(appError('INTERNAL', 'bad response envelope'));

    const resCheck = def.response.safeParse(parsed.payload);
    if (!resCheck.success)
      return err(appError('VALIDATION', 'bad response', resCheck.error.issues));
    return ok(resCheck.data as ResponseOf<T>);
  } catch (e) {
    logger.error('sendMessage', e);
    return err(appError('INTERNAL', String(e)));
  }
}

type Handler<T extends AnyMessageType> = (
  req: RequestOf<T>,
  meta: MessageMeta,
) => Promise<ResponseOf<T>>;

/** Хендлер со стёртым типом запроса — для хранения в реестре. */
type AnyHandler = (req: never, meta: MessageMeta) => Promise<unknown>;

const handlers = new Map<string, AnyHandler>();

/** Регистрирует хендлер по типу запроса (из дескрипторов фич — см. §8). */
export function registerHandler<T extends AnyMessageType>(type: T, handler: Handler<T>): void {
  if (handlers.has(type)) throw new Error(`duplicate handler: ${type}`);
  handlers.set(type, handler);
}

/** Единая точка приёма (background). Ставится на транспорт при старте SW. */
export function installRouter(transport: Transport = runtimeTransport()): () => void {
  return transport.onMessage(async (raw, meta) => {
    const parsed = parseEnvelope(raw);
    if (!parsed) return errorEnvelope(appError('VALIDATION', 'bad envelope'));

    const def = getMessageDef(parsed.type);
    if (!def) return errorEnvelope(appError('NO_RECEIVER', parsed.type), parsed.correlationId);

    const reqCheck = def.request.safeParse(parsed.payload);
    if (!reqCheck.success) {
      return errorEnvelope(appError('VALIDATION', 'bad request'), parsed.correlationId);
    }

    const handler = handlers.get(parsed.type);
    if (!handler) return errorEnvelope(appError('NO_RECEIVER', parsed.type), parsed.correlationId);

    try {
      const res = await handler(reqCheck.data as never, meta);
      return makeEnvelope(parsed.type, res, parsed.correlationId);
    } catch (e) {
      // Хендлер, бросивший AppErrorException, доносит точный AppError (код,
      // messageKey) до UI. Это ожидаемое, обработанное состояние (напр.
      // привилегированная страница, отказ в правах) — логируем тихо (debug), а не
      // как сбой, чтобы не засорять консоль. Непредвиденное — как ошибку.
      if (e instanceof AppErrorException) {
        logger.debug('router: handled', parsed.type, e.appError.code);
      } else {
        logger.error('router', e);
      }
      return errorEnvelope(toAppError(e), parsed.correlationId);
    }
  });
}

/**
 * Релей MAIN world ↔ background (ADR-0012). MAIN-world скрипт (`page/main-world.ts`)
 * не имеет `chrome.*` и общается только через `window.postMessage`; релей —
 * доверенный посредник в ISOLATED world.
 *
 * Поток: page (MAIN) → window.postMessage → relay → runtime → background; ответ
 * идёт обратной цепочкой, корреляция — по `correlationId` (внутри транспортов).
 * Фильтрация чужих/поддельных сообщений (маркер, `event.source`) — в
 * `windowTransport` (безопасность, ARCHITECTURE §11).
 */
import { getMessageDef } from '@/shared/messaging/registry';
import { errorEnvelope, makeEnvelope, parseEnvelope } from '@/shared/messaging/envelope';
import type { Transport } from '@/shared/messaging/transports';
import { runtimeTransport, windowTransport } from '@/shared/messaging/transports';
import { appError } from '@/shared/errors';
import { logger } from '@/shared/logger';

export interface RelayOptions {
  /** Окно для приёма MAIN→content (по умолчанию — глобальное `window`). */
  window?: Window;
  /** Канал приёма из MAIN (по умолчанию — windowTransport над `window`). */
  inbound?: Transport;
  /** Канал в background (по умолчанию — runtimeTransport). */
  outbound?: Transport;
}

/** Поднимает релей; возвращает функцию остановки (снимает listener). */
export function installRelay(options: RelayOptions = {}): () => void {
  const win = options.window ?? window;
  const inbound = options.inbound ?? windowTransport(win);
  const outbound = options.outbound ?? runtimeTransport();

  return inbound.onMessage(async (raw) => {
    const env = parseEnvelope(raw);
    if (!env) return errorEnvelope(appError('VALIDATION', 'bad envelope'));

    const def = getMessageDef(env.type);
    if (!def) {
      logger.warn('relay: unknown type', env.type);
      return errorEnvelope(appError('NO_RECEIVER', env.type), env.correlationId);
    }

    const check = def.request.safeParse(env.payload);
    if (!check.success) {
      logger.warn('relay: invalid payload', env.type);
      return errorEnvelope(appError('VALIDATION', 'bad request'), env.correlationId);
    }

    // Переотправка в background валидированного запроса.
    return outbound.send(makeEnvelope(env.type, check.data, env.correlationId));
  });
}

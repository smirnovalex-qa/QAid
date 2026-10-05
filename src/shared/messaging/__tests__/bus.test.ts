import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import { installRouter, registerHandler, sendMessage } from '@/shared/messaging/bus';
import { AppErrorException, appError } from '@/shared/errors';
import type { MessageMeta, Transport } from '@/shared/messaging/transports';

// Демонстрируем федеративный контракт: типы сообщений добавляются через
// declaration merging, без правки ядра.
declare module '@/shared/messaging/contract' {
  interface MessageContracts {
    'bus:echo': { request: { n: number }; response: { n: number } };
    'bus:orphan': { request: Record<string, never>; response: Record<string, never> };
    'bus:boom': { request: Record<string, never>; response: Record<string, never> };
    'bus:handled': { request: Record<string, never>; response: Record<string, never> };
    'bus:badres': { request: Record<string, never>; response: { ok: boolean } };
  }
}

defineMessage('bus:echo', z.object({ n: z.number() }), z.object({ n: z.number() }));
defineMessage('bus:orphan', z.object({}), z.object({}));
defineMessage('bus:boom', z.object({}), z.object({}));
defineMessage('bus:handled', z.object({}), z.object({}));
defineMessage('bus:badres', z.object({}), z.object({ ok: z.boolean() }));

/** In-memory транспорт, замыкающий клиента на роутер (без chrome). */
function loopback(): Transport {
  let handler: ((raw: unknown, meta: MessageMeta) => Promise<unknown>) | undefined;
  return {
    send(raw) {
      if (!handler) return Promise.reject(new Error('no receiver'));
      return handler(raw, { source: 'runtime' });
    },
    onMessage(cb) {
      handler = cb;
      return () => {
        handler = undefined;
      };
    },
  };
}

const transport = loopback();

beforeAll(() => {
  registerHandler('bus:echo', (req) => Promise.resolve({ n: req.n }));
  registerHandler('bus:boom', () => Promise.reject(new Error('kaboom')));
  registerHandler('bus:handled', () =>
    Promise.reject(new AppErrorException(appError('PRIVILEGED_PAGE', 'chrome://', undefined, 'k'))),
  );
  registerHandler('bus:badres', () => Promise.resolve({} as never));
  installRouter(transport);
});

describe('sendMessage / installRouter', () => {
  it('round-trips a valid request and returns typed Result', async () => {
    const res = await sendMessage('bus:echo', { n: 7 }, transport);
    expect(res).toEqual({ ok: true, value: { n: 7 } });
  });

  it('rejects a bad request at the sender (VALIDATION)', async () => {
    const res = await sendMessage('bus:echo', { n: 'x' } as never, transport);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION');
  });

  it('unknown type returns NO_RECEIVER at the sender', async () => {
    const res = await sendMessage('bus:missing' as never, {} as never, transport);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_RECEIVER');
  });

  it('registered type without a handler returns NO_RECEIVER from the router', async () => {
    const res = await sendMessage('bus:orphan', {}, transport);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_RECEIVER');
  });

  it('handler throwing is normalized to INTERNAL, never crashing the caller', async () => {
    const res = await sendMessage('bus:boom', {}, transport);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INTERNAL');
  });

  it('handler throwing AppErrorException доносит точный код/messageKey (обработанная ошибка)', async () => {
    const res = await sendMessage('bus:handled', {}, transport);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PRIVILEGED_PAGE');
      expect(res.error.messageKey).toBe('k');
    }
  });

  it('invalid response is rejected at the sender (VALIDATION)', async () => {
    const res = await sendMessage('bus:badres', {}, transport);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION');
  });

  it('throws on duplicate handler registration', () => {
    expect(() => {
      registerHandler('bus:echo', (req) => Promise.resolve({ n: req.n }));
    }).toThrow(/duplicate handler/);
  });
});

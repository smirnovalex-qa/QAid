import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineMessage } from '@/shared/messaging/registry';
import { installRelay } from '@/content/relay';
import type { Transport } from '@/shared/messaging/transports';
import { MARKER } from '@/shared/messaging/envelope';

beforeAll(() => {
  defineMessage('relay:test', z.object({ v: z.number() }), z.object({ ok: z.boolean() }));
});

function markedEvent(data: unknown, source: MessageEventSource | null): void {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

let stop: (() => void) | undefined;
let outbound: Transport & { send: ReturnType<typeof vi.fn> };

afterEach(() => {
  stop?.();
  vi.restoreAllMocks();
});

describe('content relay', () => {
  beforeEach(() => {
    outbound = {
      send: vi
        .fn()
        .mockResolvedValue({ type: 'relay:test', payload: { ok: true }, correlationId: 'c' }),
      onMessage: vi.fn(),
    };
    stop = installRelay({ window, outbound });
  });

  it('forwards a valid MAIN-world message to the background transport', () => {
    markedEvent(
      { [MARKER]: true, type: 'relay:test', payload: { v: 1 }, correlationId: 'c' },
      window,
    );
    expect(outbound.send).toHaveBeenCalledTimes(1);
    expect(outbound.send).toHaveBeenCalledWith({
      type: 'relay:test',
      payload: { v: 1 },
      correlationId: 'c',
    });
  });

  it('drops messages without the marker', () => {
    markedEvent({ type: 'relay:test', payload: { v: 1 }, correlationId: 'c' }, window);
    expect(outbound.send).not.toHaveBeenCalled();
  });

  it('drops messages from a foreign source', () => {
    markedEvent(
      { [MARKER]: true, type: 'relay:test', payload: { v: 1 }, correlationId: 'c' },
      null,
    );
    expect(outbound.send).not.toHaveBeenCalled();
  });

  it('does not forward an invalid payload', () => {
    markedEvent(
      { [MARKER]: true, type: 'relay:test', payload: { v: 'nope' }, correlationId: 'c' },
      window,
    );
    expect(outbound.send).not.toHaveBeenCalled();
  });

  it('does not forward an unknown type', () => {
    markedEvent({ [MARKER]: true, type: 'relay:unknown', payload: {}, correlationId: 'c' }, window);
    expect(outbound.send).not.toHaveBeenCalled();
  });
});

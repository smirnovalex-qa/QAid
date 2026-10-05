import { afterEach, describe, expect, it, vi } from 'vitest';
import { runtimeTransport, tabsTransport, windowTransport } from '@/shared/messaging/transports';
import { MARKER } from '@/shared/messaging/envelope';
import { logger } from '@/shared/logger';

type RuntimeListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (r?: unknown) => void,
) => boolean;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runtimeTransport', () => {
  it('send delegates to chrome.runtime.sendMessage', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ echoed: true });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage, onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
    });
    const out = await runtimeTransport().send({ hi: 1 });
    expect(sendMessage).toHaveBeenCalledWith({ hi: 1 });
    expect(out).toEqual({ echoed: true });
  });

  it('onMessage returns true and answers asynchronously via sendResponse', async () => {
    let captured: RuntimeListener | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((l: RuntimeListener) => {
            captured = l;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    runtimeTransport().onMessage((raw) => Promise.resolve({ got: raw }));
    expect(captured).toBeDefined();

    const sendResponse = vi.fn();
    const ret = captured?.({ a: 1 }, { tab: { id: 5 } }, sendResponse);
    expect(ret).toBe(true); // обязателен для async-ответа в MV3
    await Promise.resolve();
    await Promise.resolve();
    expect(sendResponse).toHaveBeenCalledWith({ got: { a: 1 } });
  });

  it('onMessage passes source-only meta when the sender has no tab', async () => {
    let captured: RuntimeListener | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((l: RuntimeListener) => {
            captured = l;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    const cb = vi.fn(() => Promise.resolve('ok'));
    runtimeTransport().onMessage(cb);

    const sendResponse = vi.fn();
    captured?.({ a: 1 }, { tab: undefined }, sendResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledWith({ a: 1 }, { source: 'runtime' });
    expect(sendResponse).toHaveBeenCalledWith('ok');
  });

  it('onMessage logs and answers undefined when the handler rejects', async () => {
    let captured: RuntimeListener | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((l: RuntimeListener) => {
            captured = l;
          }),
          removeListener: vi.fn(),
        },
      },
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    runtimeTransport().onMessage(() => Promise.reject(new Error('handler failed')));

    const sendResponse = vi.fn();
    captured?.({ a: 1 }, { tab: { id: 1 } }, sendResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith('runtimeTransport.onMessage', expect.any(Error));
    expect(sendResponse).toHaveBeenCalledWith(undefined);
  });

  it('onMessage unsubscribe removes the native listener', () => {
    const removeListener = vi.fn();
    let captured: RuntimeListener | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((l: RuntimeListener) => {
            captured = l;
          }),
          removeListener,
        },
      },
    });
    const off = runtimeTransport().onMessage(() => Promise.resolve(null));
    off();
    expect(removeListener).toHaveBeenCalledWith(captured);
  });
});

describe('tabsTransport', () => {
  it('send addresses chrome.tabs.sendMessage by tabId', async () => {
    const sendMessage = vi.fn().mockResolvedValue('ok');
    vi.stubGlobal('chrome', { tabs: { sendMessage } });
    await tabsTransport(42).send({ x: 1 });
    expect(sendMessage).toHaveBeenCalledWith(42, { x: 1 });
  });

  it('onMessage is unsupported (send-only)', () => {
    expect(() => tabsTransport(1).onMessage(() => Promise.resolve(null))).toThrow(/send-only/);
  });
});

describe('windowTransport', () => {
  it('onMessage receives marked same-window messages and ignores others', () => {
    const cb = vi.fn(() => Promise.resolve(null));
    const off = windowTransport(window).onMessage(cb);

    // Поддельное: без маркера — игнорируется.
    window.dispatchEvent(new MessageEvent('message', { data: { type: 't' }, source: window }));
    // Поддельное: чужой source — игнорируется.
    window.dispatchEvent(
      new MessageEvent('message', { data: { [MARKER]: true, type: 't', correlationId: 'c' } }),
    );
    expect(cb).not.toHaveBeenCalled();

    // Валидное: маркер + source === window.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, type: 't', payload: { v: 1 }, correlationId: 'c' },
        source: window,
      }),
    );
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('send posts a marked envelope to the target', () => {
    const post = vi.spyOn(window, 'postMessage');
    void windowTransport(window).send({ type: 't', payload: { v: 2 }, correlationId: 'c2' });
    expect(post).toHaveBeenCalledTimes(1);
    const [message] = post.mock.calls[0] ?? [];
    expect(message).toMatchObject({ [MARKER]: true, type: 't', correlationId: 'c2' });
  });

  it('send resolves with payload on the matching marked reply, ignoring noise', async () => {
    const pending = windowTransport(window).send({ type: 'ask', correlationId: 'cid-1' });

    // Чужой source — игнорируется (source по умолчанию null !== window).
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, __reply__: true, correlationId: 'cid-1', payload: 'wrong-source' },
      }),
    );
    // Немаркированный ответ — игнорируется.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { __reply__: true, correlationId: 'cid-1', payload: 'unmarked' },
        source: window,
      }),
    );
    // Не reply (входящее сообщение, а не ответ) — игнорируется в onReply.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, correlationId: 'cid-1', payload: 'not-a-reply' },
        source: window,
      }),
    );
    // Маркированный reply, но чужой correlationId — игнорируется.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, __reply__: true, correlationId: 'other', payload: 'mismatch' },
        source: window,
      }),
    );
    // Валидный reply: маркер + __reply__ + source === window + совпавший correlationId.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, __reply__: true, correlationId: 'cid-1', payload: { ok: 1 } },
        source: window,
      }),
    );

    await expect(pending).resolves.toEqual({ ok: 1 });
  });

  it('send generates a correlationId when the envelope lacks one', () => {
    const post = vi.spyOn(window, 'postMessage');
    void windowTransport(window).send({ type: 't' });
    const [message] = post.mock.calls[0] ?? [];
    expect(message).toMatchObject({ [MARKER]: true, type: 't' });
    expect(typeof (message as { correlationId?: unknown }).correlationId).toBe('string');
  });

  it('send wraps a non-record payload into a marked envelope', () => {
    const post = vi.spyOn(window, 'postMessage');
    void windowTransport(window).send('scalar');
    const [message] = post.mock.calls[0] ?? [];
    expect(message).toMatchObject({ [MARKER]: true });
    expect(typeof (message as { correlationId?: unknown }).correlationId).toBe('string');
  });

  it('onMessage replies with the handler result for valid incoming messages', async () => {
    const post = vi.spyOn(window, 'postMessage');
    const off = windowTransport(window).onMessage(() => Promise.resolve({ pong: true }));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, type: 'ping', correlationId: 'rc-1' },
        source: window,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        [MARKER]: true,
        __reply__: true,
        correlationId: 'rc-1',
        payload: { pong: true },
      }),
      '*',
    );
    off();
  });

  it('onMessage logs and does not throw when the handler rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const off = windowTransport(window).onMessage(() => Promise.reject(new Error('boom')));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { [MARKER]: true, type: 'ping', correlationId: 'rc-2' },
        source: window,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith('windowTransport.onMessage', expect.any(Error));
    off();
  });
});

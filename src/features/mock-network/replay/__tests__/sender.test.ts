import { describe, it, expect, vi } from 'vitest';
import { createSender } from '../sender';
import type { FetchImpl } from '../sender';
import type { RequestSpec } from '../../types';

function spec(over?: Partial<RequestSpec>): RequestSpec {
  return {
    method: 'GET',
    url: 'https://api.example.com/users',
    query: [],
    headers: [],
    body: '',
    bodyMode: 'none',
    ...over,
  };
}

/** Минимальный fake Headers (get + forEach) — не зависим от глобального Headers. */
function fakeHeaders(map: Record<string, string>): Headers {
  const entries = Object.entries(map);
  return {
    get: (name: string) =>
      entries.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null,
    forEach: (cb: (value: string, key: string) => void) => {
      for (const [k, v] of entries) cb(v, k);
    },
  } as unknown as Headers;
}

interface FakeResponseInit {
  status?: number;
  statusText?: string;
  url?: string;
  headers?: Record<string, string>;
  text?: string;
  body?: unknown;
}

function fakeResponse(init: FakeResponseInit = {}): Response {
  return {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    url: init.url ?? '',
    headers: fakeHeaders(init.headers ?? {}),
    body: init.body ?? null,
    text: () => Promise.resolve(init.text ?? ''),
  } as unknown as Response;
}

/** Fake ReadableStream, выдающий заданные чанки (для проверки капа стримом). */
function streamOf(chunks: Uint8Array[]): unknown {
  let i = 0;
  const cancel = vi.fn(() => Promise.resolve());
  return {
    getReader: () => ({
      read: () =>
        Promise.resolve(
          i < chunks.length
            ? { done: false, value: chunks[i++] }
            : { done: true, value: undefined },
        ),
      cancel,
    }),
    cancel,
  };
}

describe('createSender.send', () => {
  it('успешный GET: собирает URL с query, не шлёт тело, мапит метаданные', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl: FetchImpl = (url, init) => {
      seenUrl = url;
      seenInit = init;
      return Promise.resolve(
        fakeResponse({
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'application/json' },
          text: '{"ok":true}',
          url: 'https://api.example.com/users?page=2',
        }),
      );
    };
    const sender = createSender({
      fetchImpl,
      now: (() => {
        let t = 1000;
        return () => (t += 5);
      })(),
    });

    const res = await sender.send(spec({ query: [{ key: 'page', value: '2', enabled: true }] }));

    expect(seenUrl).toBe('https://api.example.com/users?page=2');
    expect(seenInit?.method).toBe('GET');
    expect(seenInit?.body).toBeUndefined();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.status).toBe(201);
      expect(res.response.statusText).toBe('Created');
      expect(res.response.headers).toEqual([{ key: 'content-type', value: 'application/json' }]);
      expect(res.response.body).toBe('{"ok":true}');
      expect(res.response.sizeBytes).toBe(11);
      expect(res.response.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.response.url).toBe('https://api.example.com/users?page=2');
    }
  });

  it('POST: шлёт тело и включённые заголовки; метод в upper', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl: FetchImpl = (_url, init) => {
      seenInit = init;
      return Promise.resolve(fakeResponse({ text: 'ok' }));
    };
    const sender = createSender({ fetchImpl });

    await sender.send(
      spec({
        method: 'post',
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true },
          { key: 'X-Skip', value: 'no', enabled: false },
        ],
        body: '{"a":1}',
        bodyMode: 'json',
      }),
    );

    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.body).toBe('{"a":1}');
    expect(seenInit?.headers).toEqual([['Content-Type', 'application/json']]);
  });

  it('сетевой сбой → ok:false network (не бросает)', async () => {
    const fetchImpl: FetchImpl = () => Promise.reject(new Error('boom'));
    const res = await createSender({ fetchImpl }).send(spec());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('network');
      expect(res.error.message).toBe('boom');
    }
  });

  it('таймаут → ok:false timeout (abort по таймеру)', async () => {
    const hanging: FetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    const res = await createSender({ fetchImpl: hanging, timeoutMs: 10 }).send(spec());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('timeout');
  });

  it('too-large по заголовку content-length', async () => {
    const fetchImpl: FetchImpl = () =>
      Promise.resolve(fakeResponse({ headers: { 'content-length': '999999' }, text: 'x' }));
    const res = await createSender({ fetchImpl, maxBytes: 10 }).send(spec());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('too-large');
  });

  it('too-large по фактическому размеру тела (text-путь)', async () => {
    const fetchImpl: FetchImpl = () => Promise.resolve(fakeResponse({ text: 'abcdefghijk' }));
    const res = await createSender({ fetchImpl, maxBytes: 5 }).send(spec());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('too-large');
  });

  it('стримовое чтение тела (getReader) собирает текст', async () => {
    const enc = new TextEncoder();
    const fetchImpl: FetchImpl = () =>
      Promise.resolve(fakeResponse({ body: streamOf([enc.encode('hel'), enc.encode('lo')]) }));
    const res = await createSender({ fetchImpl }).send(spec());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.response.body).toBe('hello');
      expect(res.response.sizeBytes).toBe(5);
    }
  });

  it('стрим превышает кап → too-large и cancel', async () => {
    const enc = new TextEncoder();
    const fetchImpl: FetchImpl = () =>
      Promise.resolve(fakeResponse({ body: streamOf([enc.encode('123'), enc.encode('456')]) }));
    const res = await createSender({ fetchImpl, maxBytes: 4 }).send(spec());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('too-large');
  });

  it('bad-request: пустой URL', async () => {
    const fetchImpl: FetchImpl = () => Promise.resolve(fakeResponse());
    const res = await createSender({ fetchImpl }).send(spec({ url: '' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('bad-request');
  });

  it('bad-request: пустой метод', async () => {
    const fetchImpl: FetchImpl = () => Promise.resolve(fakeResponse());
    const res = await createSender({ fetchImpl }).send(spec({ method: '   ' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('bad-request');
  });
});

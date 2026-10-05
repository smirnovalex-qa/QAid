/**
 * Тесты content-хоста Cache Storage (TASK-031) через инъекцию фейкового `caches` в
 * глобал (как задумано в host.ts). Реальные `Request`/`Response` (Node-глобалы) для
 * потока хендлеров; рукотворные response-подобные объекты — для веток `toEntry`,
 * которые нельзя воспроизвести конструктором (`opaque`/binary/too-large).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cacheHandlers, installCacheContentHost } from '@/shared/inspection/cache/host';
import { CACHE_MAX_BODY } from '@/shared/inspection/cache/types';

/** Map-based fake одного кэша. */
class FakeCache {
  readonly entries = new Map<string, Response>();
  keys(): Promise<Request[]> {
    return Promise.resolve([...this.entries.keys()].map((u) => new Request(u)));
  }
  match(req: Request | string): Promise<Response | undefined> {
    const url = typeof req === 'string' ? req : req.url;
    const res = this.entries.get(url);
    return Promise.resolve(res?.clone());
  }
  delete(req: Request | string): Promise<boolean> {
    const url = typeof req === 'string' ? req : req.url;
    return Promise.resolve(this.entries.delete(url));
  }
  put(url: string, res: Response): void {
    this.entries.set(url, res);
  }
}

/** Map-based fake CacheStorage; `failOpen` — имя кэша, чей `open` бросает (ветка catch). */
class FakeCaches {
  readonly caches = new Map<string, FakeCache>();
  failOpen: string | null = null;
  keys(): Promise<string[]> {
    return Promise.resolve([...this.caches.keys()]);
  }
  open(name: string): Promise<FakeCache> {
    if (name === this.failOpen) return Promise.reject(new Error('open failed'));
    let c = this.caches.get(name);
    if (c === undefined) {
      c = new FakeCache();
      this.caches.set(name, c);
    }
    return Promise.resolve(c);
  }
  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.delete(name));
  }
}

const O = 'http://localhost:3000';
let fake: FakeCaches;

function setCaches(value: unknown): void {
  (globalThis as { caches?: unknown }).caches = value;
}

beforeEach(() => {
  fake = new FakeCaches();
  setCaches(fake);
});

afterEach(() => {
  setCaches(undefined);
});

describe('requireCaches', () => {
  it('бросает типизированную ошибку, если CacheStorage недоступен', async () => {
    setCaches(undefined);
    await expect(cacheHandlers.list()).rejects.toMatchObject({
      appError: { messageKey: 'cache.error.unavailable' },
    });
  });
});

describe('list', () => {
  it('пустое хранилище → пустой список + origin', async () => {
    const res = await cacheHandlers.list();
    expect(res.caches).toEqual([]);
    expect(typeof res.origin).toBe('string');
  });

  it('считает записи каждого кэша', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/a`, new Response('a'));
    c.put(`${O}/b`, new Response('b'));
    await fake.open('empty');
    const res = await cacheHandlers.list();
    expect(res.caches).toContainEqual({ name: 'v1', count: 2 });
    expect(res.caches).toContainEqual({ name: 'empty', count: 0 });
  });

  it('битый кэш (open бросает) → count 0, остальные целы', async () => {
    await fake.open('ok');
    fake.caches.set('bad', new FakeCache());
    fake.failOpen = 'bad';
    const res = await cacheHandlers.list();
    expect(res.caches).toContainEqual({ name: 'bad', count: 0 });
    expect(res.caches.some((s) => s.name === 'ok')).toBe(true);
  });
});

describe('get', () => {
  it('возвращает текстовую запись', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/j`, new Response('{"a":1}', { headers: { 'content-type': 'application/json' } }));
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.truncated).toBe(false);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]?.bodyText).toBe('{"a":1}');
    expect(res.entries[0]?.reqUrl).toBe(`${O}/j`);
  });

  it('усекает по лимиту записей (truncated)', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/1`, new Response('x'));
    c.put(`${O}/2`, new Response('y'));
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1', limit: 1 });
    expect(res.entries).toHaveLength(1);
    expect(res.truncated).toBe(true);
  });

  it('пустое тело → bodyOmitted empty', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/e`, new Response('', { headers: { 'content-type': 'text/plain' } }));
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.entries[0]?.bodyOmitted).toBe('empty');
  });

  it('длинное тело усекается (bodyTruncated)', async () => {
    const c = await fake.open('v1');
    const big = 'a'.repeat(CACHE_MAX_BODY + 10);
    c.put(`${O}/big`, new Response(big, { headers: { 'content-type': 'text/plain' } }));
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.entries[0]?.bodyTruncated).toBe(true);
  });
});

describe('toEntry (через get с рукотворными ответами)', () => {
  /** Кладёт в кэш «сырой» ответ-подобный объект, минуя реальный Response. */
  function putRaw(cache: FakeCache, url: string, res: unknown): void {
    cache.entries.set(url, res as Response);
  }

  it('opaque-ответ → тело недоступно', async () => {
    const c = await fake.open('v1');
    putRaw(c, `${O}/op`, {
      url: `${O}/op`,
      method: 'GET',
      status: 0,
      statusText: '',
      ok: false,
      type: 'opaque',
      headers: new Headers(),
      clone() {
        return this;
      },
      text: () => Promise.resolve(''),
    });
    // keys() строит новый Request(url); match вернёт наш объект.
    c.entries.set(`${O}/op`, c.entries.get(`${O}/op`)!);
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.entries[0]?.bodyOmitted).toBe('opaque');
  });

  it('бинарный тип → bodyOmitted binary', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/png`, new Response('BIN', { headers: { 'content-type': 'image/png' } }));
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.entries[0]?.bodyOmitted).toBe('binary');
  });

  it('слишком большое по Content-Length → too-large', async () => {
    const c = await fake.open('v1');
    c.put(
      `${O}/big`,
      new Response('x', {
        headers: {
          'content-type': 'text/plain',
          'content-length': String(CACHE_MAX_BODY + 1),
        },
      }),
    );
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.entries[0]?.bodyOmitted).toBe('too-large');
  });

  it('отсутствующий ответ (match → undefined) → bodyOmitted error', async () => {
    const c = await fake.open('v1');
    // Ключ есть в keys(), но match вернёт undefined (нет в map под этим url).
    const orig = c.keys.bind(c);
    c.keys = (): Promise<Request[]> => orig().then((rs) => [...rs, new Request(`${O}/ghost`)]);
    const res = await cacheHandlers.get({ tabId: 1, cache: 'v1' });
    expect(res.entries.some((e) => e.bodyOmitted === 'error')).toBe(true);
  });
});

describe('remove', () => {
  it('удаляет существующую запись → ok true', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/x`, new Response('x'));
    const res = await cacheHandlers.remove({ tabId: 1, cache: 'v1', reqUrl: `${O}/x` });
    expect(res.ok).toBe(true);
    expect(c.entries.has(`${O}/x`)).toBe(false);
  });

  it('несуществующая запись → ok false', async () => {
    await fake.open('v1');
    const res = await cacheHandlers.remove({ tabId: 1, cache: 'v1', reqUrl: `${O}/none` });
    expect(res.ok).toBe(false);
  });
});

describe('clear', () => {
  it('очищает один кэш и возвращает число записей', async () => {
    const c = await fake.open('v1');
    c.put(`${O}/1`, new Response('a'));
    c.put(`${O}/2`, new Response('b'));
    const res = await cacheHandlers.clear({ tabId: 1, cache: 'v1' });
    expect(res.removed).toBe(2);
    expect(fake.caches.has('v1')).toBe(false);
  });

  it('без имени — удаляет все кэши домена', async () => {
    (await fake.open('a')).put(`${O}/1`, new Response('x'));
    (await fake.open('b')).put(`${O}/2`, new Response('y'));
    const res = await cacheHandlers.clear({ tabId: 1 });
    expect(res.removed).toBe(2);
    expect(await fake.keys()).toEqual([]);
  });

  it('битый кэш при подсчёте → 0, но всё равно удаляется', async () => {
    fake.caches.set('bad', new FakeCache());
    fake.failOpen = 'bad';
    const res = await cacheHandlers.clear({ tabId: 1, cache: 'bad' });
    expect(res.removed).toBe(0);
    expect(fake.caches.has('bad')).toBe(false);
  });
});

describe('installCacheContentHost', () => {
  it('идемпотентен (повторный вызов не бросает)', () => {
    expect(() => {
      installCacheContentHost();
      installCacheContentHost();
    }).not.toThrow();
  });
});

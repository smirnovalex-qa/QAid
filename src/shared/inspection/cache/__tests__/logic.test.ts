/**
 * Тесты чистой логики Cache Storage (TASK-031): классификация тела, усечение,
 * сводка заголовков, zod-снимки. Без DOM/chrome — канон «core ~100%».
 */
import { describe, expect, it } from 'vitest';
import {
  buildEntry,
  CacheEntrySchema,
  CacheSnapshotSchema,
  decideBody,
  isTextContentType,
  parseSnapshot,
  serializeSnapshot,
  summarizeHeaders,
  truncateText,
} from '@/shared/inspection/cache/logic';
import {
  CACHE_MAX_BODY,
  type CacheEntry,
  type CacheSnapshot,
} from '@/shared/inspection/cache/types';

describe('isTextContentType', () => {
  it('null и пустой тип — не текст', () => {
    expect(isTextContentType(null)).toBe(false);
    expect(isTextContentType('')).toBe(false);
    expect(isTextContentType('   ')).toBe(false);
  });

  it('распознаёт text/* по префиксу (и игнорирует параметры/регистр)', () => {
    expect(isTextContentType('text/html')).toBe(true);
    expect(isTextContentType('TEXT/HTML; charset=utf-8')).toBe(true);
    expect(isTextContentType('text/plain')).toBe(true);
  });

  it('распознаёт точные совпадения (json/xml/js/svg)', () => {
    expect(isTextContentType('application/json')).toBe(true);
    expect(isTextContentType('application/javascript')).toBe(true);
    expect(isTextContentType('image/svg+xml')).toBe(true);
  });

  it('распознаёт суффиксы +json / +xml', () => {
    expect(isTextContentType('application/vnd.api+json')).toBe(true);
    expect(isTextContentType('application/atom+xml')).toBe(true);
  });

  it('бинарные типы — не текст', () => {
    expect(isTextContentType('image/png')).toBe(false);
    expect(isTextContentType('application/octet-stream')).toBe(false);
    expect(isTextContentType('font/woff2')).toBe(false);
  });
});

describe('decideBody', () => {
  const base = { responseType: 'basic', contentType: 'application/json', contentLength: 10 };

  it('читает текстовое тело в пределах бюджета', () => {
    expect(decideBody(base)).toEqual({ read: true });
  });

  it('opaque / opaqueredirect — тело недоступно', () => {
    expect(decideBody({ ...base, responseType: 'opaque' })).toEqual({
      read: false,
      reason: 'opaque',
    });
    expect(decideBody({ ...base, responseType: 'opaqueredirect' })).toEqual({
      read: false,
      reason: 'opaque',
    });
  });

  it('превышение Content-Length бюджета — too-large', () => {
    expect(decideBody({ ...base, contentLength: CACHE_MAX_BODY + 1 })).toEqual({
      read: false,
      reason: 'too-large',
    });
  });

  it('уважает пользовательский maxBody', () => {
    expect(decideBody({ ...base, contentLength: 100, maxBody: 50 })).toEqual({
      read: false,
      reason: 'too-large',
    });
    expect(decideBody({ ...base, contentLength: 40, maxBody: 50 })).toEqual({ read: true });
  });

  it('нетекстовый тип — binary', () => {
    expect(decideBody({ ...base, contentType: 'image/png' })).toEqual({
      read: false,
      reason: 'binary',
    });
    expect(decideBody({ ...base, contentType: null })).toEqual({ read: false, reason: 'binary' });
  });

  it('неизвестная длина (null) не блокирует чтение текста', () => {
    expect(decideBody({ ...base, contentLength: null })).toEqual({ read: true });
  });
});

describe('truncateText', () => {
  it('не трогает текст в пределах предела', () => {
    expect(truncateText('hello', 10)).toEqual({ text: 'hello', truncated: false });
    expect(truncateText('exact', 5)).toEqual({ text: 'exact', truncated: false });
  });

  it('усекает и помечает превышение', () => {
    const res = truncateText('abcdef', 3);
    expect(res.truncated).toBe(true);
    expect(res.text).toBe('abc…');
  });

  it('по умолчанию использует CACHE_MAX_BODY', () => {
    expect(truncateText('short')).toEqual({ text: 'short', truncated: false });
  });
});

describe('summarizeHeaders', () => {
  it('сортирует по имени и приводит к кортежам', () => {
    const out = summarizeHeaders([
      ['x-b', '2'],
      ['x-a', '1'],
    ]);
    expect(out).toEqual([
      ['x-a', '1'],
      ['x-b', '2'],
    ]);
  });

  it('усекает по числу заголовков', () => {
    const many: [string, string][] = Array.from({ length: 10 }, (_, i) => [
      `h${String(i)}`,
      String(i),
    ]);
    expect(summarizeHeaders(many, 3)).toHaveLength(3);
  });

  it('работает с Headers-подобным итератором', () => {
    const headers = new Map([
      ['content-type', 'application/json'],
      ['cache-control', 'no-store'],
    ]);
    const out = summarizeHeaders(headers.entries());
    expect(out[0]?.[0]).toBe('cache-control');
  });
});

describe('buildEntry', () => {
  it('собирает запись из полей без мутации входа', () => {
    const input = {
      reqUrl: 'https://x/y',
      reqMethod: 'GET',
      status: 200,
      statusText: 'OK',
      ok: true,
      responseType: 'basic',
      contentType: 'application/json',
      headers: [['content-type', 'application/json']] as [string, string][],
      bodyText: '{}',
      bodyTruncated: false,
      bodyOmitted: null,
    };
    const entry = buildEntry(input);
    expect(entry).toEqual(input);
    expect(CacheEntrySchema.safeParse(entry).success).toBe(true);
  });
});

describe('snapshot serialize/parse', () => {
  const snapshot: CacheSnapshot = {
    origin: 'https://example.com',
    caches: [
      {
        name: 'v1',
        truncated: false,
        entries: [
          buildEntry({
            reqUrl: 'https://example.com/a',
            reqMethod: 'GET',
            status: 200,
            statusText: 'OK',
            ok: true,
            responseType: 'basic',
            contentType: 'text/plain',
            headers: [['content-type', 'text/plain']],
            bodyText: 'hi',
            bodyTruncated: false,
            bodyOmitted: null,
          }),
        ],
      },
    ],
  };

  it('round-trips через serialize → parse', () => {
    const json = serializeSnapshot(snapshot);
    const res = parseSnapshot(json);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(snapshot);
  });

  it('невалидный JSON → invalid-json', () => {
    expect(parseSnapshot('{not json')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('валидный JSON, но не та форма → invalid-shape', () => {
    expect(parseSnapshot('{"origin":123}')).toEqual({ ok: false, error: 'invalid-shape' });
  });

  it('CacheSnapshotSchema отвергает битую запись', () => {
    const bad = { origin: 'x', caches: [{ name: 'v1', truncated: false, entries: [{}] }] };
    expect(CacheSnapshotSchema.safeParse(bad).success).toBe(false);
  });

  it('CacheEntrySchema требует обязательные поля', () => {
    const partial: Partial<CacheEntry> = { reqUrl: 'x' };
    expect(CacheEntrySchema.safeParse(partial).success).toBe(false);
  });
});

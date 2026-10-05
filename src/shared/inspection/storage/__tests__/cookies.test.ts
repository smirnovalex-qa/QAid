import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// Мокаем платформенный seam ДО импорта хендлеров cookies.
vi.mock('@/platform', () => ({
  cookies: {
    getAll: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  tabs: {
    getUrl: vi.fn(),
  },
}));

import { cookies as platformCookies, tabs } from '@/platform';
import { cookieHandlers } from '@/shared/inspection/storage/cookies';
import { AppErrorException } from '@/shared/errors';

const getAll = platformCookies.getAll as unknown as Mock;
const setCookie = platformCookies.set as unknown as Mock;
const removeCookie = platformCookies.remove as unknown as Mock;
const getUrl = tabs.getUrl as unknown as Mock;

const rawCookie = {
  name: 'session',
  value: 'abc',
  domain: 'example.test',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  expirationDate: 1_800_000_000,
};

beforeEach(() => {
  getAll.mockReset();
  setCookie.mockReset();
  removeCookie.mockReset();
  getUrl.mockReset();
  getUrl.mockResolvedValue('https://example.test/app');
});

describe('cookies/list', () => {
  it('maps platform cookies to records and returns the domain', async () => {
    getAll.mockResolvedValue([rawCookie]);
    const res = await cookieHandlers.list({ tabId: 5 });
    expect(getAll).toHaveBeenCalledWith({ url: 'https://example.test/app' });
    expect(res.domain).toBe('example.test');
    expect(res.cookies[0]).toMatchObject({ name: 'session', sameSite: 'lax', httpOnly: true });
  });

  it('throws a typed error for a tab without a url', async () => {
    getUrl.mockResolvedValue(undefined);
    await expect(cookieHandlers.list({ tabId: 5 })).rejects.toBeInstanceOf(AppErrorException);
  });

  it('normalizes an unknown sameSite to unspecified', async () => {
    getAll.mockResolvedValue([{ ...rawCookie, sameSite: 'weird' }]);
    const res = await cookieHandlers.list({ tabId: 5 });
    expect(res.cookies[0]?.sameSite).toBe('unspecified');
  });
});

describe('cookies/set', () => {
  it('builds a url from the cookie attributes and reports ok', async () => {
    setCookie.mockResolvedValue({});
    const res = await cookieHandlers.set({
      tabId: 5,
      cookie: {
        name: 'a',
        value: 'v',
        domain: 'example.test',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
      },
    });
    expect(res).toEqual({ ok: true });
    expect(setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.test/', name: 'a', sameSite: 'lax' }),
    );
  });

  it('omits sameSite when unspecified', async () => {
    setCookie.mockResolvedValue({});
    await cookieHandlers.set({
      tabId: 5,
      cookie: {
        name: 'a',
        value: 'v',
        domain: 'example.test',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'unspecified',
      },
    });
    const details = setCookie.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('sameSite' in details).toBe(false);
    expect(details.url).toBe('http://example.test/');
  });

  it('reports not-ok when set returns null', async () => {
    setCookie.mockResolvedValue(null);
    const res = await cookieHandlers.set({
      tabId: 5,
      cookie: {
        name: 'a',
        value: 'v',
        domain: 'example.test',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
      },
    });
    expect(res).toEqual({ ok: false });
  });
});

describe('cookies/remove', () => {
  it('removes matching cookies by their own attributes', async () => {
    getAll.mockResolvedValue([rawCookie]);
    removeCookie.mockResolvedValue({});
    const res = await cookieHandlers.remove({ tabId: 5, name: 'session' });
    expect(removeCookie).toHaveBeenCalledWith({ url: 'https://example.test/', name: 'session' });
    expect(res).toEqual({ ok: true });
  });

  it('returns not-ok when no cookie matches', async () => {
    getAll.mockResolvedValue([rawCookie]);
    const res = await cookieHandlers.remove({ tabId: 5, name: 'nope' });
    expect(res).toEqual({ ok: false });
    expect(removeCookie).not.toHaveBeenCalled();
  });
});

describe('cookies/clear', () => {
  it('removes every cookie and counts them', async () => {
    getAll.mockResolvedValue([rawCookie, { ...rawCookie, name: 'other', secure: false }]);
    removeCookie.mockResolvedValue({});
    const res = await cookieHandlers.clear({ tabId: 5 });
    expect(res).toEqual({ removed: 2 });
    expect(removeCookie).toHaveBeenCalledTimes(2);
  });
});

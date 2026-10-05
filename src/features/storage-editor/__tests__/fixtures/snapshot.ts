/** Тестовые снимки состояния домена (TASK-017). */
import type { CookieRecord, StorageSnapshot } from '@/shared/inspection/storage/types';

export const cookieA: CookieRecord = {
  name: 'session',
  value: 'abc',
  domain: 'example.test',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  expirationDate: 1_800_000_000,
};

export const cookieB: CookieRecord = {
  name: 'flag',
  value: 'on',
  domain: 'example.test',
  path: '/app',
  secure: false,
  httpOnly: false,
  sameSite: 'strict',
};

export const currentSnapshot: StorageSnapshot = {
  cookies: [cookieA],
  local: [
    { key: 'theme', value: 'dark' },
    { key: 'lang', value: 'en' },
  ],
  session: [{ key: 'step', value: '1' }],
};

export const incomingSnapshot: StorageSnapshot = {
  cookies: [cookieA, cookieB],
  local: [
    { key: 'theme', value: 'light' }, // changed
    { key: 'flagX', value: 'y' }, // added
  ],
  session: [{ key: 'step', value: '1' }], // unchanged
};

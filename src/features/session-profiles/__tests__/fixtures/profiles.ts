/** Переиспользуемые фикстуры для тестов «Профили сессий» (TASK-047). Без ассертов. */
import type {
  CookieRecord,
  StorageEntry,
  StorageSnapshot,
} from '@/shared/inspection/storage/types';
import type { SessionProfile, SessionScope } from '../../types';
import { createProfile } from '../../logic';

/** Фиксированный момент времени для детерминированных билдеров. */
export const NOW = 1_800_000_000_000;

/** Область сайта example.com (https). */
export const scope: SessionScope = {
  origin: 'https://example.com',
  cookieDomain: 'example.com',
};

/** Персистентная auth-cookie (с датой истечения). */
export const authCookie: CookieRecord = {
  name: 'auth',
  value: 'token-abcdef-1234567890',
  domain: 'example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  expirationDate: 1_900_000_000,
};

/** Сессионная httpOnly cookie (без `expirationDate`). */
export const sessionCookie: CookieRecord = {
  name: 'sid',
  value: 'sess-XYZ',
  domain: 'example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'strict',
};

/** Записи localStorage. */
export const localEntries: StorageEntry[] = [
  { key: 'theme', value: 'dark' },
  { key: 'lang', value: 'ru' },
];

/** Записи sessionStorage. */
export const sessionEntries: StorageEntry[] = [{ key: 'wizardStep', value: '2' }];

/** Полный снимок состояния домена. */
export const snapshot: StorageSnapshot = {
  cookies: [authCookie, sessionCookie],
  local: localEntries,
  session: sessionEntries,
};

/** Профиль «Admin» на example.com. */
export const adminProfile: SessionProfile = createProfile({
  name: 'Admin',
  scope,
  snapshot,
  now: NOW,
});

/** Профиль «Guest» на example.com — с более поздним updatedAt (для проверки сортировки). */
export const guestProfile: SessionProfile = createProfile({
  name: 'Guest',
  scope,
  snapshot: {
    cookies: [{ ...authCookie, value: 'guest-token' }],
    local: [{ key: 'theme', value: 'light' }],
    session: [],
  },
  now: NOW + 5_000,
});

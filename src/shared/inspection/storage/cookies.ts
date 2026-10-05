/**
 * Background-обёртка над cookies (TASK-017). Реализует доменные хендлеры `cookies/*`
 * поверх платформенного seam `@/platform` (`cookies.getAll/set/remove`, `tabs.getUrl`).
 * Прямой `chrome.cookies` вне платформы запрещён (ADR-0014) — всё идёт через seam.
 *
 * `HttpOnly`-cookie здесь редактируемо (в отличие от чистого JS на странице) — это
 * ценный дифференциатор для QA. Тонкость `chrome.cookies.set`: требуется корректный
 * `url` (схема по `secure` + домен + путь), иначе запись не применится — собираем его
 * чистым `buildCookieUrl` из `logic.ts`.
 *
 * Форма хендлеров — `BackgroundHandler` (`@/features/registry`): `{ type, handler }`.
 * Вход уже провалидирован zod в роутере, поэтому приводим `unknown` к контракту.
 */
import './messages';
import type { BackgroundHandler } from '@/features/registry';
import type { RequestOf } from '@/shared/messaging/contract';
import { cookies as platformCookies, tabs } from '@/platform';
import { appError, AppErrorException } from '@/shared/errors';
import { buildCookieUrl } from './logic';
import type { CookieRecord, SameSite } from './types';

type PlatformCookieList = Awaited<ReturnType<typeof platformCookies.getAll>>;
type PlatformCookie = PlatformCookieList[number];
type SetDetails = Parameters<typeof platformCookies.set>[0];

/** URL активной вкладки или типизированная ошибка (привилегированная страница/нет url). */
async function tabUrl(tabId: number): Promise<string> {
  const url = await tabs.getUrl(tabId);
  if (url === undefined || url === '') {
    throw new AppErrorException(
      appError('PRIVILEGED_PAGE', 'no tab url for cookies', undefined, 'storage.error.noTab'),
    );
  }
  return url;
}

/** Хост (домен) URL для отображения; пустая строка, если распарсить не удалось. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Нормализует `sameSite` платформы к нашему union (значение по умолчанию — `unspecified`). */
function toSameSite(raw: string): SameSite {
  if (raw === 'no_restriction' || raw === 'lax' || raw === 'strict') return raw;
  return 'unspecified';
}

/** Плоский снимок платформенной cookie (без `expirationDate` у сессионных). */
function toRecord(c: PlatformCookie): CookieRecord {
  const base = {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: toSameSite(c.sameSite),
  };
  return c.expirationDate !== undefined ? { ...base, expirationDate: c.expirationDate } : base;
}

/** Собирает `SetDetailsType` из записи + `url`; опциональные поля — условно. */
function toSetDetails(url: string, cookie: CookieRecord): SetDetails {
  const details: {
    url: string;
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite?: SameSite;
    expirationDate?: number;
  } = {
    url,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
  };
  // `unspecified` не передаём — пусть браузер решает сам (иначе трактовка разнится).
  if (cookie.sameSite !== 'unspecified') details.sameSite = cookie.sameSite;
  if (cookie.expirationDate !== undefined) details.expirationDate = cookie.expirationDate;
  return details;
}

async function list(
  req: RequestOf<'cookies/list'>,
): Promise<{ cookies: CookieRecord[]; domain: string }> {
  const url = await tabUrl(req.tabId);
  const raw = await platformCookies.getAll({ url });
  return { cookies: raw.map(toRecord), domain: hostOf(url) };
}

async function set(req: RequestOf<'cookies/set'>): Promise<{ ok: boolean }> {
  const url = buildCookieUrl(req.cookie);
  // Тип платформы обещает `Cookie`, но реальный `chrome.cookies.set` при неудаче
  // отдаёт `null`/`undefined` — трактуем результат мягко (widening через `unknown`).
  const result: unknown = await platformCookies.set(toSetDetails(url, req.cookie));
  return { ok: result != null };
}

async function remove(req: RequestOf<'cookies/remove'>): Promise<{ ok: boolean }> {
  const url = await tabUrl(req.tabId);
  // Находим точные совпадения по имени (+ домен/путь при наличии), чтобы собрать
  // корректный `url` из собственных атрибутов cookie (в т.ч. `secure`).
  const all = await platformCookies.getAll({ url });
  const targets = all.filter(
    (c) =>
      c.name === req.name &&
      (req.domain === undefined || c.domain === req.domain) &&
      (req.path === undefined || c.path === req.path),
  );
  if (targets.length === 0) return { ok: false };
  let ok = false;
  for (const c of targets) {
    const removed = await platformCookies.remove({
      url: buildCookieUrl(c),
      name: c.name,
    });
    if (removed !== null) ok = true;
  }
  return { ok };
}

async function clear(req: RequestOf<'cookies/clear'>): Promise<{ removed: number }> {
  const url = await tabUrl(req.tabId);
  const all = await platformCookies.getAll({ url });
  let removed = 0;
  for (const c of all) {
    const res = await platformCookies.remove({ url: buildCookieUrl(c), name: c.name });
    if (res !== null) removed += 1;
  }
  return { removed };
}

/**
 * Доменные хендлеры cookies. Экспортируются как объекты для прямого юнит-тестирования
 * и подключаются в SW из background-барели (`@/features/background` →
 * `registerBackground('storage-editor', …)`, ADR-0047).
 */
export const cookieHandlers = { list, set, remove, clear };

export const cookieBackgroundHandlers: BackgroundHandler[] = [
  { type: 'cookies/list', handler: (req) => list(req as RequestOf<'cookies/list'>) },
  { type: 'cookies/set', handler: (req) => set(req as RequestOf<'cookies/set'>) },
  { type: 'cookies/remove', handler: (req) => remove(req as RequestOf<'cookies/remove'>) },
  { type: 'cookies/clear', handler: (req) => clear(req as RequestOf<'cookies/clear'>) },
];

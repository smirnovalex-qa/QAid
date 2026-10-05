/**
 * Образцы JWT для тестов декодера. Токены собираются из JSON-объектов
 * base64url-кодированием. Кодер самодостаточен (TextEncoder + ручная таблица),
 * без Node `Buffer` — глобал `Buffer` не типизирован в этом tsconfig.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** UTF-8 → base64url (без паддинга). */
function b64urlBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += ALPHABET.charAt((n >>> 18) & 63) + ALPHABET.charAt((n >>> 12) & 63);
    if (b1 !== undefined) out += ALPHABET.charAt((n >>> 6) & 63);
    if (b2 !== undefined) out += ALPHABET.charAt(n & 63);
  }
  return out;
}

function b64url(obj: unknown): string {
  return b64urlBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

/** Собирает компактный JWT из header/payload (+ опциональная «подпись»). */
export function makeJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature = 'sig',
): string {
  return `${b64url(header)}.${b64url(payload)}.${signature}`;
}

const H = { alg: 'HS256', typ: 'JWT' };

/** Фиксированное «сейчас» (секунды) для детерминированных проверок exp/nbf. */
export const NOW_SECONDS = 1_700_000_000;

/** Валидный подписанный токен с iat/nbf/exp вокруг NOW_SECONDS. */
export const VALID_JWT = makeJwt(H, {
  sub: '1234567890',
  name: 'Alice',
  iat: NOW_SECONDS - 100,
  nbf: NOW_SECONDS - 100,
  exp: NOW_SECONDS + 3600,
});

/** Кириллические значения claim'ов — проверка UTF-8-декодирования. */
export const UNICODE_JWT = makeJwt(H, {
  name: 'Алексей Иванов',
  role: 'администратор',
  iat: NOW_SECONDS,
});

/** Истёкший токен (exp в прошлом относительно NOW_SECONDS). */
export const EXPIRED_JWT = makeJwt(H, { sub: 'x', exp: NOW_SECONDS - 3600 });

/** Ещё не активный токен (nbf в будущем). */
export const NOT_YET_VALID_JWT = makeJwt(H, { sub: 'x', nbf: NOW_SECONDS + 3600 });

/** Unsecured JWT (`alg:none`, пустая подпись). */
export const UNSECURED_JWT = makeJwt({ alg: 'none', typ: 'JWT' }, { sub: 'x' }, '');

/** Битые токены. */
export const TWO_SEGMENTS = 'aaa.bbb';
export const BAD_BASE64_SEGMENT = 'not+base64.also+bad.sig';
export const NON_OBJECT_PAYLOAD = makeJwt(H, [] as unknown as Record<string, unknown>);

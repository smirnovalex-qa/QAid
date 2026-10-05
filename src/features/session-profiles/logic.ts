/**
 * Чистая логика фичи «Профили сессий» (TASK-047) — БЕЗ DOM/chrome/@platform/preact.
 *
 * Разрешённые импорты: `zod`, слой снимков TASK-017 (`@/shared/inspection/storage/*`)
 * и локальные `./types`. Единственная допустимая недетерминированность —
 * `crypto.randomUUID()` для генерации id (как в mock-network `scenarios.ts`). Время
 * НИКОГДА не берётся из `Date.now()` внутри билдеров — оно инжектится параметром `now`,
 * чтобы функции оставались детерминированными и тестируемыми.
 *
 * Ключевые решения (подробно ниже по месту):
 *  - «prune-then-apply»: в режиме `replace` сначала вычищаем чужие записи, потом пишем
 *    целевые — иначе остатки предыдущей сессии протекут в новую (смешанная сессия).
 *  - keying cookies идентичен `cookieKey` из storage/logic.ts (`имя домен путь`), чтобы
 *    диф и план замены сходились по адресации 1-в-1.
 *  - маскирование значений: показываем края, прячем середину — для безопасного
 *    предпросмотра токенов/сессионных значений в UI без раскрытия секрета целиком.
 *  - версионированный конверт экспорта: kind+schemaVersion+data (как в settings-sync),
 *    с хуком под миграции при инкременте версии.
 */
import { z } from 'zod';
import { StorageSnapshotSchema } from '@/shared/inspection/storage/logic';
import { EncryptedRecordSchema } from '@/shared/crypto/vault';
import type {
  CookieRecord,
  StorageEntry,
  StorageSnapshot,
} from '@/shared/inspection/storage/types';
import type {
  EncryptedProfile,
  PersistedProfile,
  ScopeCompatibility,
  SessionProfile,
  SessionScope,
  SwapAreaPlan,
  SwapCookieRemoval,
  SwapEntryOp,
  SwapMode,
  SwapPlan,
} from './types';

/** Дискриминатор конверта экспорта профиля. */
export const SESSION_PROFILE_KIND = 'session-profile';

/** Текущая версия схемы конверта профиля (инкремент → добавить миграцию ниже). */
export const SESSION_PROFILE_SCHEMA_VERSION = 1;

// ── zod-схемы ────────────────────────────────────────────────────────────────────

/** Схема области профиля. */
export const SessionScopeSchema = z.object({
  origin: z.string(),
  cookieDomain: z.string(),
});

/**
 * Схема профиля. Поле `snapshot` переиспускает `StorageSnapshotSchema` из TASK-017 —
 * мы не переописываем форму снимка, а ссылаемся на канон.
 */
export const SessionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: SessionScopeSchema,
  snapshot: StorageSnapshotSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Схема зашифрованного профиля (at-rest, TASK-050): те же открытые метаданные, но
 * `snapshot` заменён конвертом `enc` (`EncryptedRecordSchema` из `shared/crypto`).
 * Форма снимка НЕ переописывается здесь — она внутри зашифрованного байт-потока.
 */
export const EncryptedProfileSchema: z.ZodType<EncryptedProfile, z.ZodTypeDef, unknown> = z.object({
  id: z.string(),
  name: z.string(),
  scope: SessionScopeSchema,
  enc: EncryptedRecordSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Схема персистентного профиля — дискриминированное объединение открытой и
 * зашифрованной форм. `z.union` пробует открытую первой (дефолт/обратная
 * совместимость TASK-047), затем зашифрованную. Профиль без `snapshot` и без `enc`
 * не проходит ни одну — настройки откатятся к дефолту (пустой список), а не упадут.
 */
export const PersistedProfileSchema: z.ZodType<PersistedProfile, z.ZodTypeDef, unknown> = z.union([
  SessionProfileSchema,
  EncryptedProfileSchema,
]);

/** Тайп-гард: профиль хранится в зашифрованной форме (есть конверт `enc`). */
export function isEncryptedProfile(profile: PersistedProfile): profile is EncryptedProfile {
  return 'enc' in profile;
}

/** Тайп-гард: профиль хранится в ОТКРЫТОЙ форме (есть `snapshot`). */
export function isOpenProfile(profile: PersistedProfile): profile is SessionProfile {
  return 'snapshot' in profile;
}

/** Грубая оценка надёжности мастер-пароля (для индикатора в UI). */
export type PasswordStrength = 'weak' | 'fair' | 'strong';

/**
 * Эвристика надёжности пароля с ДОМИНИРУЮЩЕЙ ДЛИНОЙ.
 *
 * Классы символов учитываются, но длина решает: длинная парольная фраза (XKCD-936 —
 * «correct horse battery staple») надёжнее короткого пароля с подстановками, и её нельзя
 * метить `weak`/«сделайте длиннее». Поэтому ≥20 символов — сразу `strong` независимо от
 * классов; более короткие поднимаются за счёт разнообразия. PBKDF2 лишь замедляет
 * перебор — энтропию несёт сам пароль. Детерминированно.
 */
export function passwordStrength(password: string): PasswordStrength {
  const len = password.length;
  if (len === 0) return 'weak';
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  if (len >= 20 || (len >= 14 && classes >= 2) || (len >= 12 && classes >= 3)) return 'strong';
  if (len >= 12 || (len >= 10 && classes >= 2) || (len >= 8 && classes >= 3)) return 'fair';
  return 'weak';
}

// ── создание / модификация профилей ───────────────────────────────────────────────

/** Генерирует уникальный id профиля (единственная точка недетерминизма). */
export function newProfileId(): string {
  return `sp-${crypto.randomUUID()}`;
}

/**
 * Создаёт новый профиль. `createdAt` и `updatedAt` совпадают и равны инжектированному
 * `now`. Имя тримится (пустое/пробельное имя — забота UI-валидации, тут только чистим).
 */
export function createProfile(input: {
  name: string;
  scope: SessionScope;
  snapshot: StorageSnapshot;
  now: number;
}): SessionProfile {
  return {
    id: newProfileId(),
    name: input.name.trim(),
    scope: input.scope,
    snapshot: input.snapshot,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Возвращает копию профиля со свежим `updatedAt` (например, после пересъёмки снимка). */
export function touchProfile(profile: SessionProfile, now: number): SessionProfile {
  return { ...profile, updatedAt: now };
}

/**
 * Собирает снимок состояния из результатов чтения браузера (cookies + две области
 * web storage). Делает защитные копии массивов, чтобы снимок не разделял ссылку с
 * источником чтения (иммутабельность профиля).
 */
export function buildSnapshotFromReads(
  cookies: readonly CookieRecord[],
  local: readonly StorageEntry[],
  session: readonly StorageEntry[],
): StorageSnapshot {
  return {
    cookies: [...cookies],
    local: [...local],
    session: [...session],
  };
}

// ── область (scope) ────────────────────────────────────────────────────────────────

/**
 * Выводит область из URL. Только http(s): для `chrome://`, `about:`, мусора и
 * непарсящихся строк возвращает `null` (профиль сессии имеет смысл лишь на веб-origin).
 * `cookieDomain` = hostname (уже без порта и без ведущей точки).
 */
export function deriveScope(url: string): SessionScope | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return { origin: parsed.origin, cookieDomain: parsed.hostname };
}

/**
 * Оценивает совместимость области профиля с текущей областью вкладки.
 *
 * Precedence (важен порядок проверок):
 *  1. origin'ы совпадают → полностью совместимо (web storage и cookies сойдутся).
 *  2. иначе, если `cookieDomain` РАЗЛИЧАЕТСЯ → `domain-mismatch` — это более
 *     фундаментальное расхождение (разные сайты): даже cookies не применить.
 *  3. иначе (домен тот же, origin отличается — http/https, порт, поддомен-хост тот же)
 *     → `origin-mismatch`: cookies бы легли, но web storage относится к другому origin,
 *     поэтому применять профиль небезопасно без явного подтверждения.
 */
export function scopeCompatibility(
  profileScope: SessionScope,
  currentScope: SessionScope,
): ScopeCompatibility {
  if (profileScope.origin === currentScope.origin) {
    return { compatible: true };
  }
  if (profileScope.cookieDomain !== currentScope.cookieDomain) {
    return { compatible: false, reason: 'domain-mismatch' };
  }
  return { compatible: false, reason: 'origin-mismatch' };
}

// ── план горячей замены ──────────────────────────────────────────────────────────

/**
 * Стабильный ключ cookie — ИДЕНТИЧЕН приватному `cookieKey` из storage/logic.ts
 * (`имя домен путь`). Реплицируем его здесь намеренно (там он не экспортируется),
 * чтобы адресация cookie в плане замены совпадала с адресацией в дифе снимков 1-в-1.
 */
function cookieKey(c: CookieRecord): string {
  return `${c.name} ${c.domain} ${c.path}`;
}

/**
 * Строит план горячей замены состояния `current → target`.
 *
 * Рационал «prune-then-apply» (для `replace`): нельзя просто наложить целевые записи
 * поверх текущих — записи предыдущей сессии, которых нет в целевом профиле, останутся
 * и создадут «смешанную» сессию (частично старый, частично новый пользователь). Поэтому
 * в `replace` план дополнительно перечисляет удаления того, что есть сейчас, но
 * отсутствует в целевом. В `apply` удалений нет вовсе (аддитивный режим).
 *
 * - `cookieSets` — всегда ВСЕ cookies целевого профиля (их запишут).
 * - `cookieRemoves` — только `replace`: cookies из `current`, ключа которых нет в
 *   `target` (ключ = имя+домен+путь).
 * - `local.sets`/`session.sets` — все записи соответствующей области целевого профиля.
 * - `local.removes`/`session.removes` — только `replace`: ключи из `current`, которых
 *   нет в `target`.
 * - `predicted.applied` = число всех операций записи; `predicted.removed` = число всех
 *   удалений (0 в режиме `apply`).
 */
export function buildSwapPlan(
  current: StorageSnapshot,
  target: StorageSnapshot,
  mode: SwapMode,
): SwapPlan {
  const prune = mode === 'replace';

  // cookies: пишем все целевые; удаляем «чужие» только в replace.
  const cookieSets = [...target.cookies];
  const targetCookieKeys = new Set(target.cookies.map(cookieKey));
  const cookieRemoves: SwapCookieRemoval[] = prune
    ? current.cookies
        .filter((c) => !targetCookieKeys.has(cookieKey(c)))
        .map((c) => ({ name: c.name, domain: c.domain, path: c.path }))
    : [];

  const local = buildAreaPlan(current.local, target.local, prune);
  const session = buildAreaPlan(current.session, target.session, prune);

  const applied = cookieSets.length + local.sets.length + session.sets.length;
  const removed = cookieRemoves.length + local.removes.length + session.removes.length;

  return {
    cookieSets,
    cookieRemoves,
    local,
    session,
    predicted: { applied, removed },
  };
}

/** План одной области web storage: все целевые записи + (в prune) удаление лишних ключей. */
function buildAreaPlan(
  current: readonly StorageEntry[],
  target: readonly StorageEntry[],
  prune: boolean,
): SwapAreaPlan {
  const sets: SwapEntryOp[] = target.map((e) => ({ key: e.key, value: e.value }));
  if (!prune) return { sets, removes: [] };
  const targetKeys = new Set(target.map((e) => e.key));
  const removes = current.filter((e) => !targetKeys.has(e.key)).map((e) => e.key);
  return { sets, removes };
}

// ── маскирование значений ─────────────────────────────────────────────────────────

/**
 * Маскирует потенциально секретное значение для безопасного предпросмотра в UI.
 * Для длины > 6 показываем первые 2 и последние 2 символа, середину заменяем на «•»
 * (сохраняя длину). Для более коротких непустых значений — полная маска (все «•»),
 * т.к. краёв слишком мало, чтобы что-то не выдать. Пустая строка → пустая строка.
 * Детерминированно и не зависит от содержимого, кроме длины.
 */
export function maskValue(value: string): string {
  const len = value.length;
  if (len === 0) return '';
  if (len > 6) {
    return `${value.slice(0, 2)}${'•'.repeat(len - 4)}${value.slice(len - 2)}`;
  }
  return '•'.repeat(len);
}

// ── конверт экспорта/импорта ──────────────────────────────────────────────────────

/**
 * Миграция конверта профиля с версии `from` на `from + 1`. Локальный минимальный тип
 * (форма как у settings-sync `EnvelopeMigration`) — на будущее, когда схема изменится.
 */
export interface EnvelopeMigration {
  readonly from: number;
  migrate(prev: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Сериализует профиль в человекочитаемый (2 пробела) JSON-конверт с дискриминатором
 * и версией схемы — чтобы импорт мог распознать вид и версию, а не гадать по форме.
 */
export function serializeProfile(profile: SessionProfile): string {
  return JSON.stringify(
    {
      kind: SESSION_PROFILE_KIND,
      schemaVersion: SESSION_PROFILE_SCHEMA_VERSION,
      data: profile,
    },
    null,
    2,
  );
}

/** Результат разбора конверта профиля: успех со значением либо код ошибки. */
export type ParseProfileResult =
  | { readonly ok: true; readonly value: SessionProfile }
  | {
      readonly ok: false;
      readonly error: 'invalid-json' | 'invalid-shape' | 'unknown-kind' | 'unsupported-version';
    };

/**
 * Разбирает текст конверта профиля. Никогда не бросает. Проверки по порядку:
 *  1. валидный JSON (иначе `invalid-json`);
 *  2. `kind === SESSION_PROFILE_KIND` (иначе `unknown-kind`);
 *  3. `schemaVersion === текущая` (иначе `unsupported-version` — здесь же хук миграций:
 *     при появлении v2+ прогнать `EnvelopeMigration` вверх до текущей перед валидацией);
 *  4. `data` проходит `SessionProfileSchema` (иначе `invalid-shape`).
 */
export function parseProfile(text: string): ParseProfileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'invalid-shape' };
  }
  const envelope = raw as Record<string, unknown>;
  if (envelope.kind !== SESSION_PROFILE_KIND) {
    return { ok: false, error: 'unknown-kind' };
  }
  // Хук миграций: при schemaVersion < текущей прогнать цепочку EnvelopeMigration
  // (from → from+1) над envelope до SESSION_PROFILE_SCHEMA_VERSION. Пока версия одна.
  if (envelope.schemaVersion !== SESSION_PROFILE_SCHEMA_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }
  const parsed = SessionProfileSchema.safeParse(envelope.data);
  if (!parsed.success) {
    return { ok: false, error: 'invalid-shape' };
  }
  return { ok: true, value: parsed.data };
}

// ── коллекция профилей (иммутабельные хелперы) ────────────────────────────────────

/** Вставляет или заменяет профиль по id (замена по месту, иначе — добавление в конец). */
export function upsertProfile(
  profiles: readonly SessionProfile[],
  profile: SessionProfile,
): SessionProfile[] {
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx === -1) return [...profiles, profile];
  const next = [...profiles];
  next[idx] = profile;
  return next;
}

/** Удаляет профиль по id (возвращает новый массив). */
export function removeProfile(profiles: readonly SessionProfile[], id: string): SessionProfile[] {
  return profiles.filter((p) => p.id !== id);
}

/** Переименовывает профиль по id (тримит имя, обновляет `updatedAt`). Нет id → без изменений. */
export function renameProfile(
  profiles: readonly SessionProfile[],
  id: string,
  name: string,
  now: number,
): SessionProfile[] {
  return profiles.map((p) => (p.id === id ? { ...p, name: name.trim(), updatedAt: now } : p));
}

/**
 * Дублирует профиль: копия с новым id, именем-суффиксом «<name> copy» и
 * `createdAt = updatedAt = now`, вставленная сразу ПОСЛЕ оригинала. Нет id → без изменений.
 */
export function duplicateProfile(
  profiles: readonly SessionProfile[],
  id: string,
  now: number,
): SessionProfile[] {
  const idx = profiles.findIndex((p) => p.id === id);
  const original = idx === -1 ? undefined : profiles[idx];
  if (original === undefined) return [...profiles];
  const copy: SessionProfile = {
    ...original,
    id: newProfileId(),
    name: `${original.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
  const next = [...profiles];
  next.splice(idx + 1, 0, copy);
  return next;
}

/**
 * Профили, чей origin совпадает с областью (для списка «профили этого сайта»).
 * Обобщён по форме (`SessionProfile` или `EncryptedProfile`) — список и группировка
 * работают по ОТКРЫТЫМ метаданным даже когда снимок зашифрован (сейф залочен).
 */
export function profilesForScope<T extends { readonly scope: SessionScope }>(
  profiles: readonly T[],
  scope: SessionScope,
): T[] {
  return profiles.filter((p) => p.scope.origin === scope.origin);
}

/**
 * Группирует профили по origin. Группы отсортированы по origin по возрастанию,
 * профили внутри группы — по `updatedAt` по убыванию (свежие сверху). Обобщён по
 * форме — работает и по метаданным зашифрованных профилей (список виден в залоке).
 */
export function groupBySite<T extends { readonly scope: SessionScope; readonly updatedAt: number }>(
  profiles: readonly T[],
): { origin: string; profiles: T[] }[] {
  const byOrigin = new Map<string, T[]>();
  for (const p of profiles) {
    const bucket = byOrigin.get(p.scope.origin);
    if (bucket) bucket.push(p);
    else byOrigin.set(p.scope.origin, [p]);
  }
  return [...byOrigin.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((origin) => ({
      origin,
      profiles: [...(byOrigin.get(origin) ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
    }));
}

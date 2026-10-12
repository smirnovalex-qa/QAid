import { describe, expect, it } from 'vitest';
import type { StorageSnapshot } from '@/shared/inspection/storage/types';
import {
  SESSION_PROFILE_KIND,
  SESSION_PROFILE_SCHEMA_VERSION,
  buildSnapshotFromReads,
  buildSwapPlan,
  createProfile,
  deriveScope,
  duplicateProfile,
  groupBySite,
  maskValue,
  newProfileId,
  parseProfile,
  profilesForScope,
  refreshProfileSnapshot,
  removeProfile,
  renameProfile,
  scopeCompatibility,
  serializeProfile,
  touchProfile,
  upsertProfile,
  isEncryptedProfile,
  isOpenProfile,
  passwordStrength,
  EncryptedProfileSchema,
} from '../logic';
import {
  NOW,
  adminProfile,
  authCookie,
  guestProfile,
  localEntries,
  scope,
  sessionCookie,
  sessionEntries,
  snapshot,
} from './fixtures/profiles';

describe('newProfileId', () => {
  it('имеет префикс sp- и уникален', () => {
    const a = newProfileId();
    const b = newProfileId();
    expect(a).toMatch(/^sp-/);
    expect(a).not.toBe(b);
  });
});

describe('createProfile / touchProfile', () => {
  it('ставит id, createdAt = updatedAt = now, тримит имя', () => {
    const p = createProfile({ name: '  Admin  ', scope, snapshot, now: NOW });
    expect(p.id).toMatch(/^sp-/);
    expect(p.name).toBe('Admin');
    expect(p.createdAt).toBe(NOW);
    expect(p.updatedAt).toBe(NOW);
    expect(p.scope).toEqual(scope);
    expect(p.snapshot).toBe(snapshot);
  });

  it('touchProfile обновляет только updatedAt', () => {
    const t = touchProfile(adminProfile, NOW + 1000);
    expect(t.updatedAt).toBe(NOW + 1000);
    expect(t.createdAt).toBe(adminProfile.createdAt);
    expect(t.id).toBe(adminProfile.id);
    expect(t.name).toBe(adminProfile.name);
  });

  it('refreshProfileSnapshot меняет снимок и updatedAt, сохраняя id/name/scope/createdAt', () => {
    const fresh = { cookies: [], local: [{ key: 'rt', value: 'new' }], session: [] };
    const r = refreshProfileSnapshot(adminProfile, fresh, NOW + 5000);
    expect(r.snapshot).toBe(fresh);
    expect(r.updatedAt).toBe(NOW + 5000);
    expect(r.id).toBe(adminProfile.id);
    expect(r.name).toBe(adminProfile.name);
    expect(r.scope).toEqual(adminProfile.scope);
    expect(r.createdAt).toBe(adminProfile.createdAt);
    // Исходный профиль не мутируется.
    expect(adminProfile.snapshot).not.toBe(fresh);
  });
});

describe('buildSnapshotFromReads', () => {
  it('собирает снимок с защитными копиями', () => {
    const cookies = [authCookie];
    const local = [...localEntries];
    const session = [...sessionEntries];
    const snap = buildSnapshotFromReads(cookies, local, session);
    expect(snap.cookies).toEqual(cookies);
    expect(snap.cookies).not.toBe(cookies);
    expect(snap.local).not.toBe(local);
    expect(snap.session).not.toBe(session);
  });
});

describe('deriveScope', () => {
  it('http/https → origin + hostname', () => {
    expect(deriveScope('https://example.com/path?q=1')).toEqual({
      origin: 'https://example.com',
      cookieDomain: 'example.com',
    });
    expect(deriveScope('http://sub.example.com:8080/x')).toEqual({
      origin: 'http://sub.example.com:8080',
      cookieDomain: 'sub.example.com',
    });
  });

  it('chrome:// и прочие схемы → null', () => {
    expect(deriveScope('chrome://extensions')).toBeNull();
    expect(deriveScope('about:blank')).toBeNull();
    expect(deriveScope('file:///c:/x')).toBeNull();
  });

  it('мусор → null', () => {
    expect(deriveScope('not a url')).toBeNull();
    expect(deriveScope('')).toBeNull();
  });
});

describe('scopeCompatibility', () => {
  it('одинаковые origin → совместимо, без reason', () => {
    expect(scopeCompatibility(scope, { ...scope })).toEqual({ compatible: true });
  });

  it('разные cookieDomain → domain-mismatch', () => {
    expect(
      scopeCompatibility(scope, { origin: 'https://other.com', cookieDomain: 'other.com' }),
    ).toEqual({ compatible: false, reason: 'domain-mismatch' });
  });

  it('тот же домен, но разный origin → origin-mismatch', () => {
    expect(
      scopeCompatibility(scope, { origin: 'http://example.com', cookieDomain: 'example.com' }),
    ).toEqual({ compatible: false, reason: 'origin-mismatch' });
  });
});

describe('buildSwapPlan', () => {
  const current: StorageSnapshot = {
    cookies: [
      authCookie,
      { ...authCookie, name: 'stale', value: 'old' }, // отсутствует в target
      { ...authCookie, path: '/admin' }, // тот же name/domain, другой path → другой ключ
    ],
    local: [
      { key: 'theme', value: 'dark' },
      { key: 'gone', value: 'x' }, // отсутствует в target
    ],
    session: [{ key: 'old', value: '1' }],
  };
  const target: StorageSnapshot = {
    cookies: [authCookie, sessionCookie],
    local: [
      { key: 'theme', value: 'light' },
      { key: 'lang', value: 'ru' },
    ],
    session: [{ key: 'new', value: '2' }],
  };

  it('replace: пишет все целевые, удаляет отсутствующие (keying по name+domain+path)', () => {
    const plan = buildSwapPlan(current, target, 'replace');
    expect(plan.cookieSets).toEqual([authCookie, sessionCookie]);
    // stale и /admin отсутствуют в target → удаляются; auth (/) остаётся.
    expect(plan.cookieRemoves).toEqual([
      { name: 'stale', domain: 'example.com', path: '/' },
      { name: 'auth', domain: 'example.com', path: '/admin' },
    ]);
    expect(plan.local.sets).toEqual([
      { key: 'theme', value: 'light' },
      { key: 'lang', value: 'ru' },
    ]);
    expect(plan.local.removes).toEqual(['gone']);
    expect(plan.session.sets).toEqual([{ key: 'new', value: '2' }]);
    expect(plan.session.removes).toEqual(['old']);
    expect(plan.predicted.applied).toBe(2 + 2 + 1);
    expect(plan.predicted.removed).toBe(2 + 1 + 1);
  });

  it('apply: удалений нет, removed = 0', () => {
    const plan = buildSwapPlan(current, target, 'apply');
    expect(plan.cookieRemoves).toEqual([]);
    expect(plan.local.removes).toEqual([]);
    expect(plan.session.removes).toEqual([]);
    expect(plan.cookieSets).toHaveLength(2);
    expect(plan.predicted.applied).toBe(5);
    expect(plan.predicted.removed).toBe(0);
  });
});

describe('maskValue', () => {
  it('пустая строка → пустая', () => {
    expect(maskValue('')).toBe('');
  });

  it('короткая (<=6) → полная маска', () => {
    expect(maskValue('a')).toBe('•');
    expect(maskValue('abcdef')).toBe('••••••');
  });

  it('длинная (>6) → края видны, середина скрыта, длина сохранена', () => {
    const masked = maskValue('abcdefgh'); // len 8
    expect(masked).toBe('ab••••gh');
    expect(masked).toHaveLength(8);
  });
});

describe('serializeProfile / parseProfile', () => {
  it('round-trip восстанавливает профиль', () => {
    const text = serializeProfile(adminProfile);
    expect(text).toContain(SESSION_PROFILE_KIND);
    const res = parseProfile(text);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(adminProfile);
  });

  it('битый JSON → invalid-json', () => {
    expect(parseProfile('{not json')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it('примитив/не-объект → invalid-shape', () => {
    expect(parseProfile('42')).toEqual({ ok: false, error: 'invalid-shape' });
    expect(parseProfile('null')).toEqual({ ok: false, error: 'invalid-shape' });
  });

  it('чужой kind → unknown-kind', () => {
    const text = JSON.stringify({ kind: 'other', schemaVersion: 1, data: adminProfile });
    expect(parseProfile(text)).toEqual({ ok: false, error: 'unknown-kind' });
  });

  it('другая версия → unsupported-version', () => {
    const text = JSON.stringify({
      kind: SESSION_PROFILE_KIND,
      schemaVersion: SESSION_PROFILE_SCHEMA_VERSION + 1,
      data: adminProfile,
    });
    expect(parseProfile(text)).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('невалидная data → invalid-shape', () => {
    const text = JSON.stringify({
      kind: SESSION_PROFILE_KIND,
      schemaVersion: SESSION_PROFILE_SCHEMA_VERSION,
      data: { id: 'x', name: 'y' },
    });
    expect(parseProfile(text)).toEqual({ ok: false, error: 'invalid-shape' });
  });
});

describe('коллекция профилей', () => {
  it('upsertProfile добавляет новый и заменяет по id', () => {
    const list = [adminProfile];
    const added = upsertProfile(list, guestProfile);
    expect(added).toHaveLength(2);

    const edited = { ...adminProfile, name: 'Admin2' };
    const replaced = upsertProfile(added, edited);
    expect(replaced).toHaveLength(2);
    expect(replaced.find((p) => p.id === adminProfile.id)?.name).toBe('Admin2');
  });

  it('removeProfile убирает по id', () => {
    const list = [adminProfile, guestProfile];
    expect(removeProfile(list, adminProfile.id)).toEqual([guestProfile]);
    expect(removeProfile(list, 'missing')).toHaveLength(2);
  });

  it('renameProfile тримит имя и обновляет updatedAt; чужой id без изменений', () => {
    const list = [adminProfile];
    const renamed = renameProfile(list, adminProfile.id, '  New  ', NOW + 9);
    expect(renamed[0]!.name).toBe('New');
    expect(renamed[0]!.updatedAt).toBe(NOW + 9);
    expect(renameProfile(list, 'missing', 'X', NOW + 9)[0]!.name).toBe(adminProfile.name);
  });

  it('duplicateProfile: новый id, суффикс copy, вставка после оригинала', () => {
    const list = [adminProfile, guestProfile];
    const dup = duplicateProfile(list, adminProfile.id, NOW + 100);
    expect(dup).toHaveLength(3);
    const copy = dup[1]!;
    expect(copy.id).not.toBe(adminProfile.id);
    expect(copy.name).toBe('Admin copy');
    expect(copy.createdAt).toBe(NOW + 100);
    expect(copy.updatedAt).toBe(NOW + 100);
    expect(dup[2]!.id).toBe(guestProfile.id);
  });

  it('duplicateProfile с отсутствующим id → без изменений (новый массив)', () => {
    const list = [adminProfile];
    const dup = duplicateProfile(list, 'missing', NOW);
    expect(dup).toEqual(list);
    expect(dup).not.toBe(list);
  });

  it('profilesForScope фильтрует по origin', () => {
    const other = createProfile({
      name: 'X',
      scope: { origin: 'https://other.com', cookieDomain: 'other.com' },
      snapshot,
      now: NOW,
    });
    const list = [adminProfile, other];
    expect(profilesForScope(list, scope)).toEqual([adminProfile]);
  });

  it('groupBySite: группы по origin asc, внутри по updatedAt desc', () => {
    const other = createProfile({
      name: 'Zed',
      scope: { origin: 'https://aaa.com', cookieDomain: 'aaa.com' },
      snapshot,
      now: NOW,
    });
    // adminProfile.updatedAt = NOW, guestProfile.updatedAt = NOW + 5000 (тот же origin).
    const groups = groupBySite([adminProfile, other, guestProfile]);
    expect(groups.map((g) => g.origin)).toEqual(['https://aaa.com', 'https://example.com']);
    const example = groups[1]!;
    expect(example.profiles.map((p) => p.id)).toEqual([guestProfile.id, adminProfile.id]);
  });
});

describe('шифрование: тайп-гарды, схема и надёжность пароля (TASK-050)', () => {
  const encrypted = {
    id: 'sp-1',
    name: 'Admin',
    scope,
    enc: { iv: 'AAAA', ciphertext: 'BBBB', schemaVersion: 1 },
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('isEncryptedProfile / isOpenProfile дискриминируют по форме', () => {
    const open = createProfile({ name: 'S', scope, snapshot, now: NOW });
    expect(isEncryptedProfile(encrypted)).toBe(true);
    expect(isEncryptedProfile(open)).toBe(false);
    expect(isOpenProfile(open)).toBe(true);
    expect(isOpenProfile(encrypted)).toBe(false);
  });

  it('EncryptedProfileSchema принимает конверт и отвергает открытую форму', () => {
    expect(EncryptedProfileSchema.safeParse(encrypted).success).toBe(true);
    const open = createProfile({ name: 'S', scope, snapshot, now: NOW });
    expect(EncryptedProfileSchema.safeParse(open).success).toBe(false);
  });

  it('passwordStrength: длина доминирует, парольные фразы не штрафуются', () => {
    expect(passwordStrength('')).toBe('weak');
    expect(passwordStrength('short')).toBe('weak'); // 5
    expect(passwordStrength('abcdefgh')).toBe('weak'); // 8, 1 класс
    // XKCD-936: длинная фраза из одних строчных — НАДЁЖНАЯ (регрессия: было «fair»).
    expect(passwordStrength('correct horse battery staple')).toBe('strong'); // 28
    expect(passwordStrength('abcdefghijklmnopqrst')).toBe('strong'); // 20, 1 класс
    expect(passwordStrength('abcdEfgh1234')).toBe('strong'); // 12, 3 класса
    expect(passwordStrength('abcdefghijkl')).toBe('fair'); // 12, 1 класс
    expect(passwordStrength('abcdEfgh12')).toBe('fair'); // 10, 3 класса
    expect(passwordStrength('abcdEFgh1234!@#$')).toBe('strong'); // 16, 4 класса
  });
});

describe('zod-схемы через parseProfile (косвенно) и sessionCookie', () => {
  it('снимок с сессионной cookie (без expirationDate) валиден в round-trip', () => {
    const p = createProfile({ name: 'S', scope, snapshot, now: NOW });
    const res = parseProfile(serializeProfile(p));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.snapshot.cookies).toContainEqual(sessionCookie);
    }
  });
});

/**
 * Тесты оркестрации сейфа (vault-store, TASK-050).
 *
 * Крипта реальная (Web Crypto из setup), но итерации PBKDF2 занижены (1000) для
 * скорости; соль/IV берутся из счётчикового источника байт — детерминированно и с
 * гарантией УНИКАЛЬНОСТИ (разные IV на каждую запись). Таймер auto-lock — поддельный
 * (инъекция `schedule`/`cancel`), чтобы проверять срабатывание без реального времени.
 * Хранилище — общий chrome-mock (сбрасывается в `afterEach` глобального setup).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_LOCK_MINUTES,
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  clampAutoLockMinutes,
  createVaultStore,
} from '../vault-store';
import type { VaultStore } from '../vault-store';
import { sessionProfilesSettings } from '../settings';
import { createProfile } from '../logic';
import type { ByteSource } from '@/shared/crypto/subtle';
import type { EncryptedProfile, PersistedProfile, SessionProfile } from '../types';

const SECRET = 'super-secret-token-value';

function makeProfile(name: string): SessionProfile {
  return createProfile({
    name,
    scope: { origin: 'https://x.test', cookieDomain: 'x.test' },
    snapshot: { cookies: [], local: [{ key: 'token', value: SECRET }], session: [] },
    now: 1,
  });
}

/** Счётчиковый источник байт: уникальные соль/IV, но детерминированно. */
function countingBytes(): ByteSource {
  let ctr = 1;
  return (n: number) => {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) a[i] = ctr++ & 0xff;
    return a;
  };
}

interface Harness {
  store: VaultStore;
  fire(): void; // «выстрелить» таймером auto-lock
  hasTimer(): boolean;
}

function makeStore(iterations = 1000): Harness {
  let scheduled: (() => void) | null = null;
  const store = createVaultStore({
    settings: sessionProfilesSettings,
    bytes: countingBytes(),
    iterations,
    schedule: (cb) => {
      scheduled = cb;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: () => {
      scheduled = null;
    },
  });
  return {
    store,
    fire: () => scheduled?.(),
    hasTimer: () => scheduled !== null,
  };
}

async function seedOpen(profiles: SessionProfile[]): Promise<void> {
  await sessionProfilesSettings.set({ profiles, activeByOrigin: {} });
}

function isEnc(p: PersistedProfile | undefined): p is EncryptedProfile {
  return p !== undefined && 'enc' in p;
}

beforeEach(async () => {
  await sessionProfilesSettings.reset();
});

describe('vault-store: enable / disable', () => {
  it('encrypts every snapshot at rest and leaves no plaintext in the blob', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();

    const res = await store.enableEncryption('pw');
    expect(res.ok).toBe(true);
    expect(store.isUnlocked()).toBe(true);

    const state = await sessionProfilesSettings.get();
    expect(state.vault).toBeDefined();
    const [p] = state.profiles;
    expect(isEnc(p)).toBe(true);
    expect(p !== undefined && 'snapshot' in p).toBe(false);
    // Самый строгий инвариант: открытого секрета в сыром блобе больше нет.
    expect(JSON.stringify(state)).not.toContain(SECRET);
  });

  it('round-trips: unlock then decrypt restores the exact snapshot', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('pw');
    store.lock();

    expect((await store.unlock('pw')).ok).toBe(true);
    const state = await sessionProfilesSettings.get();
    const dec = await store.decryptProfiles(state.profiles);
    expect(dec.ok).toBe(true);
    if (dec.ok) {
      expect(dec.value[0]?.snapshot.local[0]?.value).toBe(SECRET);
      expect(dec.value[0]?.name).toBe('Admin');
    }
  });

  it('disable with the correct password decrypts back to plaintext and drops the vault', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('pw');

    const res = await store.disableEncryption('pw');
    expect(res.ok).toBe(true);
    expect(store.isUnlocked()).toBe(false);

    const state = await sessionProfilesSettings.get();
    expect(state.vault).toBeUndefined();
    const [p] = state.profiles;
    expect(p !== undefined && 'snapshot' in p).toBe(true);
    expect(isEnc(p)).toBe(false);
  });

  it('refuses to enable twice', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('pw');
    const again = await store.enableEncryption('pw');
    expect(again).toEqual({ ok: false, error: 'already-enabled' });
  });
});

describe('vault-store: unlock errors & wrong password', () => {
  it('wrong password fails via the verifier and keeps the vault locked', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('right');
    store.lock();

    const res = await store.unlock('wrong');
    expect(res).toEqual({ ok: false, error: 'wrong-password' });
    expect(store.isUnlocked()).toBe(false);
  });

  it('unlock on a non-encrypted namespace returns no-vault', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    expect(await store.unlock('pw')).toEqual({ ok: false, error: 'no-vault' });
  });

  it('wrong password on disable / rekey is rejected', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('right');
    expect(await store.disableEncryption('wrong')).toEqual({ ok: false, error: 'wrong-password' });
    expect(await store.rekey('wrong')).toEqual({ ok: false, error: 'wrong-password' });
  });
});

describe('vault-store: MV3 lifecycle (key only in memory)', () => {
  it('after lock (simulated SW kill), secret ops require unlock — not a throw', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('pw');
    const state = await sessionProfilesSettings.get();

    store.lock(); // ключ «испарился» (SW убит / auto-lock)
    expect(await store.decryptProfiles(state.profiles)).toEqual({ ok: false, error: 'locked' });
    expect(await store.encryptProfiles([makeProfile('B')])).toEqual({ ok: false, error: 'locked' });
  });

  it('auto-lock timer clears the key when it fires', async () => {
    await seedOpen([makeProfile('Admin')]);
    const h = makeStore();
    await h.store.enableEncryption('pw');
    expect(h.store.isUnlocked()).toBe(true);
    expect(h.hasTimer()).toBe(true);

    h.fire(); // имитируем таймаут бездействия
    expect(h.store.isUnlocked()).toBe(false);
  });
});

describe('vault-store: tamper detection', () => {
  it('a flipped ciphertext byte is detected on decrypt (GCM tag), not silently wrong', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('pw');

    const state = await sessionProfilesSettings.get();
    const p = state.profiles[0];
    if (!isEnc(p)) throw new Error('expected encrypted');
    const ct = p.enc.ciphertext;
    const flipped = (ct.startsWith('A') ? 'B' : 'A') + ct.slice(1);
    await sessionProfilesSettings.set({
      ...state,
      profiles: [{ ...p, enc: { ...p.enc, ciphertext: flipped } }],
    });

    store.lock();
    expect((await store.unlock('pw')).ok).toBe(true); // verifier цел — сейф открывается
    const next = await sessionProfilesSettings.get();
    expect(await store.decryptProfiles(next.profiles)).toEqual({
      ok: false,
      error: 'decrypt-failed',
    });
  });
});

describe('vault-store: re-key (param upgrade)', () => {
  it('detects weak params and re-keys to current defaults, preserving data', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore(1000); // заниженные итерации
    await store.enableEncryption('pw');

    const weak = await sessionProfilesSettings.get();
    expect(store.needsRekey(weak.vault)).toBe(true);

    const res = await store.rekey('pw');
    expect(res.ok).toBe(true);

    const strong = await sessionProfilesSettings.get();
    expect(store.needsRekey(strong.vault)).toBe(false);
    expect(strong.vault?.iterations).toBeGreaterThanOrEqual(600_000);
    const dec = await store.decryptProfiles(strong.profiles);
    expect(dec.ok && dec.value[0]?.snapshot.local[0]?.value).toBe(SECRET);
  }, 20000);
});

describe('vault-store: IV freshness', () => {
  it('encrypting the same profile twice yields different IVs/ciphertext', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    await store.enableEncryption('pw');

    const a = await store.encryptProfiles([makeProfile('X')]);
    const b = await store.encryptProfiles([makeProfile('X')]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      const ea = a.value[0];
      const eb = b.value[0];
      if (!isEnc(ea) || !isEnc(eb)) throw new Error('expected encrypted');
      expect(ea.enc.iv).not.toBe(eb.enc.iv);
      expect(ea.enc.ciphertext).not.toBe(eb.enc.ciphertext);
    }
  });
});

describe('vault-store: status & auto-lock bounds', () => {
  it('statusOf reflects descriptor + key presence', async () => {
    await seedOpen([makeProfile('Admin')]);
    const { store } = makeStore();
    expect(store.statusOf(undefined)).toBe('disabled');
    await store.enableEncryption('pw');
    const state = await sessionProfilesSettings.get();
    expect(store.statusOf(state.vault)).toBe('unlocked');
    store.lock();
    expect(store.statusOf(state.vault)).toBe('locked');
  });

  it('clampAutoLockMinutes keeps values within bounds', () => {
    expect(clampAutoLockMinutes(undefined)).toBe(DEFAULT_AUTO_LOCK_MINUTES);
    expect(clampAutoLockMinutes(0)).toBe(MIN_AUTO_LOCK_MINUTES);
    expect(clampAutoLockMinutes(9999)).toBe(MAX_AUTO_LOCK_MINUTES);
    expect(clampAutoLockMinutes(30)).toBe(30);
    expect(clampAutoLockMinutes(Number.NaN)).toBe(DEFAULT_AUTO_LOCK_MINUTES);
  });
});

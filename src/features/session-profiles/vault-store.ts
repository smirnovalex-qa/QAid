/**
 * Оркестрация «сейфа» профилей сессий (at-rest-шифрование, TASK-050).
 *
 * Это I/O-слой: держатель производного ключа В ПАМЯТИ + таймер auto-lock + миграции
 * namespace (включить/выключить/ре-кей шифрование) + обёртки шифр/расшифр списка
 * профилей. Чистая крипта живёт в `@/shared/crypto` (формат конверта в `vault.ts`,
 * тонкий seam над `crypto.subtle` в `subtle.ts`) — здесь только композиция.
 *
 * Инварианты (DECISIONS/задача):
 *  - **Ключ только в памяти, `extractable:false`.** НИКОГДА не пишется в storage и не
 *    ходит по шине. При убитом MV3-SW ключ теряется — это ожидаемо: проектируем под
 *    повторный unlock, а не «переживание» перезапуска (и осознанно НЕ кладём ключ в
 *    `chrome.storage.session`).
 *  - **Пароль** не логируется, не сериализуется, не попадает в сообщения/ошибки.
 *  - **IV свеж на каждую запись** (в `seal`), соль — на сейф; оба инъектируются в
 *    тестах через `bytes` для детерминизма, в проде — `crypto.getRandomValues`.
 *  - **Ошибки — данными** (`Result<_, VaultError>`), не исключения в UI. Миграции
 *    атомарны на уровне записи блоба настроек: пишем новый блоб ЦЕЛИКОМ одним `set`,
 *    чтобы namespace не остался в смешанном нечитаемом состоянии.
 *  - **Verifier-canary** проверяет пароль ДО расшифровки записей (быстро, без касания
 *    секретов при неверном вводе).
 */
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { ok, err } from '@/shared/result';
import type { Result } from '@/shared/result';
import { StorageSnapshotSchema } from '@/shared/inspection/storage/logic';
import {
  PBKDF2_ITERATIONS,
  VAULT_SCHEMA_VERSION,
  bytesToBase64,
  needsRekey as needsRekeyDescriptor,
} from '@/shared/crypto/vault';
import type { VaultDescriptor } from '@/shared/crypto/vault';
import {
  cryptoBytes,
  deriveKey,
  makeVerifier,
  newSalt,
  open,
  seal,
  verifyPassword,
} from '@/shared/crypto/subtle';
import type { ByteSource } from '@/shared/crypto/subtle';
import { sessionProfilesSettings } from './settings';
import type { SessionProfilesState } from './settings';
import { isEncryptedProfile } from './logic';
import type { EncryptedProfile, PersistedProfile, SessionProfile, VaultStatus } from './types';
import type { FeatureSettings } from '@/shared/storage';

/** Типизированные коды ошибок сейфа (едут данными, не исключениями). */
export type VaultError =
  | 'no-vault' // операция требует сейф, а он не настроен
  | 'already-enabled' // попытка включить уже включённое шифрование
  | 'wrong-password' // verifier не сошёлся (неверный пароль)
  | 'locked' // нужен разблокированный ключ, а его нет в памяти
  | 'decrypt-failed' // провал GCM-тега (подмена/повреждение конверта)
  | 'invalid-snapshot'; // расшифрованный текст — не валидный снимок

/** Дефолтный таймаут auto-lock (15 минут бездействия). */
export const DEFAULT_AUTO_LOCK_MINUTES = 15;
/** Границы настраиваемого таймаута auto-lock (минуты). */
export const MIN_AUTO_LOCK_MINUTES = 1;
export const MAX_AUTO_LOCK_MINUTES = 240;

type TimerHandle = ReturnType<typeof setTimeout>;

/** Инъектируемые зависимости (детерминизм тестов). По умолчанию — реальные. */
export interface VaultStoreOptions {
  /** Слой настроек namespace'а (в тестах — memory-area инстанс). */
  readonly settings?: FeatureSettings<SessionProfilesState>;
  /** Источник байт для соли/IV (в тестах — фиксированный). */
  readonly bytes?: ByteSource;
  /** Число итераций PBKDF2 для НОВОГО сейфа (в тестах — малое для скорости). */
  readonly iterations?: number;
  /** Планировщик/отмена таймера auto-lock (в тестах — поддельный). */
  readonly schedule?: (cb: () => void, ms: number) => TimerHandle;
  readonly cancel?: (handle: TimerHandle) => void;
}

/** Зажимает таймаут auto-lock в допустимые границы (минуты). */
export function clampAutoLockMinutes(minutes: number | undefined): number {
  const m =
    typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : DEFAULT_AUTO_LOCK_MINUTES;
  return Math.max(MIN_AUTO_LOCK_MINUTES, Math.min(MAX_AUTO_LOCK_MINUTES, Math.round(m)));
}

/** Публичный контракт держателя сейфа. */
export interface VaultStore {
  /** Реактивный флаг «ключ в памяти» (для перерисовки UI вне Preact-событий). */
  readonly unlocked: Signal<boolean>;
  isUnlocked(): boolean;
  /** Выводит статус сейфа из дескриптора + наличия ключа. */
  statusOf(vault: VaultDescriptor | undefined): VaultStatus;
  /** Нужен ли ре-кей (параметры сейфа слабее текущих дефолтов). */
  needsRekey(vault: VaultDescriptor | undefined): boolean;
  unlock(password: string): Promise<Result<void, VaultError>>;
  lock(): void;
  /** Сброс таймера auto-lock при активности пользователя. */
  touch(): void;
  setAutoLockMinutes(minutes: number): void;
  /**
   * Мутации сейфа возвращают ЗАПИСАННОЕ состояние namespace в `ok` — чтобы UI отразил
   * его в реактивный сигнал напрямую (оптимистично), не читая storage заново. Так
   * статус меняется мгновенно и без зависимости от доставки `storage.onChanged`.
   */
  enableEncryption(password: string): Promise<Result<SessionProfilesState, VaultError>>;
  disableEncryption(password: string): Promise<Result<SessionProfilesState, VaultError>>;
  rekey(password: string): Promise<Result<SessionProfilesState, VaultError>>;
  /** Расшифровывает список в рабочие (открытые) профили. Залочено ⇒ `locked`. */
  decryptProfiles(
    profiles: readonly PersistedProfile[],
  ): Promise<Result<SessionProfile[], VaultError>>;
  /** Шифрует рабочие профили в персистентную форму. Залочено ⇒ `locked`. */
  encryptProfiles(
    working: readonly SessionProfile[],
  ): Promise<Result<PersistedProfile[], VaultError>>;
}

/**
 * Создаёт держатель сейфа. Ключ и таймер живут в замыкании (не в модульной области),
 * чтобы тесты были изолированы; UI использует синглтон `vaultStore` ниже.
 */
export function createVaultStore(options: VaultStoreOptions = {}): VaultStore {
  const settings = options.settings ?? sessionProfilesSettings;
  const bytes = options.bytes ?? cryptoBytes;
  const newIterations = options.iterations ?? PBKDF2_ITERATIONS;
  const schedule = options.schedule ?? ((cb, ms) => setTimeout(cb, ms));
  const cancel =
    options.cancel ??
    ((h) => {
      clearTimeout(h);
    });

  const unlocked = signal(false);
  let key: CryptoKey | null = null;
  let timer: TimerHandle | null = null;
  let autoLockMs = DEFAULT_AUTO_LOCK_MINUTES * 60_000;

  const disarm = (): void => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const arm = (): void => {
    disarm();
    timer = schedule(() => {
      lock();
    }, autoLockMs);
  };

  const setKey = (k: CryptoKey): void => {
    key = k;
    unlocked.value = true;
    arm();
  };

  const lock = (): void => {
    disarm();
    key = null;
    unlocked.value = false;
  };

  /** Параметры KDF из дескриптора (соль + итерации), для `deriveKey`. */
  const kdfOf = (d: VaultDescriptor): { salt: string; iterations: number; hash: 'sha-256' } => ({
    salt: d.salt,
    iterations: d.iterations,
    hash: 'sha-256',
  });

  /** Расшифровывает один конверт в открытый профиль (с валидацией снимка). */
  const decryptOne = async (
    k: CryptoKey,
    p: EncryptedProfile,
  ): Promise<Result<SessionProfile, VaultError>> => {
    const opened = await open(k, p.enc);
    if (!opened.ok) return err('decrypt-failed');
    let raw: unknown;
    try {
      raw = JSON.parse(opened.value);
    } catch {
      return err('invalid-snapshot');
    }
    const parsed = StorageSnapshotSchema.safeParse(raw);
    if (!parsed.success) return err('invalid-snapshot');
    return ok({
      id: p.id,
      name: p.name,
      scope: p.scope,
      snapshot: parsed.data,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  };

  /** Шифрует один открытый профиль в персистентный конверт (свежий IV). */
  const encryptOne = async (k: CryptoKey, p: SessionProfile): Promise<EncryptedProfile> => {
    const enc = await seal(k, JSON.stringify(p.snapshot), bytes);
    return {
      id: p.id,
      name: p.name,
      scope: p.scope,
      enc,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  };

  /** Расшифровывает все профили ключом `k` (открытые пропускает как есть). */
  const decryptAllWith = async (
    k: CryptoKey,
    profiles: readonly PersistedProfile[],
  ): Promise<Result<SessionProfile[], VaultError>> => {
    const out: SessionProfile[] = [];
    for (const p of profiles) {
      if (!isEncryptedProfile(p)) {
        out.push(p);
        continue;
      }
      const dec = await decryptOne(k, p);
      if (!dec.ok) return dec;
      out.push(dec.value);
    }
    return ok(out);
  };

  const buildDescriptor = (
    salt: string,
    iterations: number,
    verifier: VaultDescriptor['verifier'],
  ): VaultDescriptor => ({
    kdf: 'pbkdf2',
    hash: 'sha-256',
    iterations,
    salt,
    schemaVersion: VAULT_SCHEMA_VERSION,
    verifier,
  });

  const unlock = async (password: string): Promise<Result<void, VaultError>> => {
    const state = await settings.get();
    if (state.vault === undefined) return err('no-vault');
    autoLockMs = clampAutoLockMinutes(state.autoLockMinutes) * 60_000;
    const k = await deriveKey(password, kdfOf(state.vault));
    if (!(await verifyPassword(k, state.vault))) return err('wrong-password');
    setKey(k);
    return ok(undefined);
  };

  const enableEncryption = async (
    password: string,
  ): Promise<Result<SessionProfilesState, VaultError>> => {
    const state = await settings.get();
    if (state.vault !== undefined) return err('already-enabled');
    const salt = bytesToBase64(newSalt(bytes));
    const k = await deriveKey(password, { salt, iterations: newIterations, hash: 'sha-256' });
    const verifier = await makeVerifier(k, bytes);
    const descriptor = buildDescriptor(salt, newIterations, verifier);

    const encrypted: PersistedProfile[] = [];
    for (const p of state.profiles) {
      // В открытом сейфе всё должно быть открытым; на всякий случай зашифрованные
      // записи оставляем как есть (не теряем данные), но seal применяем к открытым.
      encrypted.push(isEncryptedProfile(p) ? p : await encryptOne(k, p));
    }

    const next: SessionProfilesState = {
      profiles: encrypted,
      activeByOrigin: state.activeByOrigin,
      vault: descriptor,
      autoLockMinutes: state.autoLockMinutes,
    };
    await settings.set(next);
    autoLockMs = clampAutoLockMinutes(state.autoLockMinutes) * 60_000;
    setKey(k);
    return ok(next);
  };

  const disableEncryption = async (
    password: string,
  ): Promise<Result<SessionProfilesState, VaultError>> => {
    const state = await settings.get();
    if (state.vault === undefined) return err('no-vault');
    const k = await deriveKey(password, kdfOf(state.vault));
    if (!(await verifyPassword(k, state.vault))) return err('wrong-password');
    const decrypted = await decryptAllWith(k, state.profiles);
    if (!decrypted.ok) return decrypted;
    // Пишем открытый блоб ЦЕЛИКОМ без `vault` ⇒ статус станет `disabled`.
    const next: SessionProfilesState = {
      profiles: decrypted.value,
      activeByOrigin: state.activeByOrigin,
      autoLockMinutes: state.autoLockMinutes,
    };
    await settings.set(next);
    lock();
    return ok(next);
  };

  const rekey = async (password: string): Promise<Result<SessionProfilesState, VaultError>> => {
    const state = await settings.get();
    if (state.vault === undefined) return err('no-vault');
    const oldKey = await deriveKey(password, kdfOf(state.vault));
    if (!(await verifyPassword(oldKey, state.vault))) return err('wrong-password');
    const decrypted = await decryptAllWith(oldKey, state.profiles);
    if (!decrypted.ok) return decrypted;

    // Ре-кей всегда поднимает параметры до ТЕКУЩИХ дефолтов (свежая соль + новый ключ).
    const salt = bytesToBase64(newSalt(bytes));
    const newKey = await deriveKey(password, {
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'sha-256',
    });
    const verifier = await makeVerifier(newKey, bytes);
    const descriptor = buildDescriptor(salt, PBKDF2_ITERATIONS, verifier);
    const encrypted: PersistedProfile[] = [];
    for (const p of decrypted.value) encrypted.push(await encryptOne(newKey, p));

    const next: SessionProfilesState = {
      profiles: encrypted,
      activeByOrigin: state.activeByOrigin,
      vault: descriptor,
      autoLockMinutes: state.autoLockMinutes,
    };
    await settings.set(next);
    setKey(newKey);
    return ok(next);
  };

  const decryptProfiles = async (
    profiles: readonly PersistedProfile[],
  ): Promise<Result<SessionProfile[], VaultError>> => {
    if (key === null) return err('locked');
    touch();
    return decryptAllWith(key, profiles);
  };

  const encryptProfiles = async (
    working: readonly SessionProfile[],
  ): Promise<Result<PersistedProfile[], VaultError>> => {
    if (key === null) return err('locked');
    touch();
    const out: PersistedProfile[] = [];
    for (const p of working) out.push(await encryptOne(key, p));
    return ok(out);
  };

  const touch = (): void => {
    if (key !== null) arm();
  };

  return {
    unlocked,
    isUnlocked: () => key !== null,
    statusOf: (vault) => (vault === undefined ? 'disabled' : key !== null ? 'unlocked' : 'locked'),
    needsRekey: (vault) => (vault === undefined ? false : needsRekeyDescriptor(vault)),
    unlock,
    lock,
    touch,
    setAutoLockMinutes: (minutes) => {
      autoLockMs = clampAutoLockMinutes(minutes) * 60_000;
      if (key !== null) arm();
    },
    enableEncryption,
    disableEncryption,
    rekey,
    decryptProfiles,
    encryptProfiles,
  };
}

/** Синглтон держателя сейфа для UI (один ключ/таймер на поверхность). */
export const vaultStore: VaultStore = createVaultStore();

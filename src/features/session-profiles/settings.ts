/**
 * Персистентное состояние фичи «Профили сессий» (TASK-047 + шифрование at-rest TASK-050).
 *
 * ВАЖНО: `types.ts` объявляет лишь `SessionProfilesSettingsState` с `activeByOrigin`,
 * но UI хранит ещё и сам список профилей — полную персистентную форму владеет эта
 * фича здесь (список профилей + активный профиль на origin + опциональный дескриптор
 * сейфа). Namespace фиксирован `session-profiles` (зарегистрирован как never-synced):
 * профили содержат секреты авторизации и НЕ должны утекать в sync-хранилище —
 * sync не добавляем осознанно, и ЗАШИФРОВАННЫЙ блоб тоже не синкается (ADR-0048/0051).
 *
 * Шифрование — ОПЦИОНАЛЬНО и обратно совместимо (TASK-050):
 *  - `profiles` хранит ОТКРЫТЫЙ `snapshot` (local-trust, дефолт) ЛИБО конверт `enc`
 *    (сейф включён) — через `PersistedProfileSchema` (union);
 *  - `vault?` — дескриптор сейфа (KDF-параметры + соль + verifier); его ОТСУТСТВИЕ
 *    означает «шифрование выключено». Дефолт — без сейфа (открытый local-trust), так
 *    что уже сохранённые профили читаются без пароля.
 */
import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { VaultDescriptorSchema } from '@/shared/crypto/vault';
import type { VaultDescriptor } from '@/shared/crypto/vault';
import { PersistedProfileSchema } from './logic';
import type { PersistedProfile } from './types';

/** Полная персистентная форма фичи: список профилей + активный профиль + сейф. */
export interface SessionProfilesState {
  readonly profiles: readonly PersistedProfile[];
  readonly activeByOrigin: Readonly<Record<string, string>>;
  /** Дескриптор сейфа; `undefined` ⇒ шифрование выключено (открытый local-trust). */
  readonly vault?: VaultDescriptor | undefined;
  /** Таймаут auto-lock в минутах (сброс ключа по бездействию). `undefined` ⇒ дефолт. */
  readonly autoLockMinutes?: number | undefined;
}

const DEFAULTS: SessionProfilesState = { profiles: [], activeByOrigin: {} };

// Схема персистентного состояния — переиспускает канон `PersistedProfileSchema` из logic
// (union открытой/зашифрованной формы) и `VaultDescriptorSchema` из shared/crypto.
const schema: z.ZodType<SessionProfilesState, z.ZodTypeDef, unknown> = z.object({
  profiles: z.array(PersistedProfileSchema),
  activeByOrigin: z.record(z.string()),
  vault: VaultDescriptorSchema.optional(),
  autoLockMinutes: z.number().optional(),
});

export const sessionProfilesSettings = defineFeatureSettings<SessionProfilesState>({
  namespace: 'session-profiles',
  schema,
  defaults: DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const sessionProfilesBinding = createSettingsBinding(sessionProfilesSettings);

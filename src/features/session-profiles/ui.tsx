/**
 * UI фичи «Профили сессий: hot-swap авторизации» (TASK-047) — редизайн v3.
 *
 * Презентация переписана под макет v3: строка сайта, основное
 * действие «Save current login as profile», карточки профилей (аватар · имя · мета ·
 * Active/Switch) с инлайн-подтверждением переключения (radio-режимы) и сейф-
 * переключатель «Protect with a password». Логика сохранена целиком: брокер прав,
 * захват/сохранение, план свапа и применение с перезагрузкой, сейф (включение/
 * разблокировка/выключение/ре-кей/авто-лок), импорт/экспорт, токен сессии и
 * зеркалирование активного профиля в статус оболочки (`setToolStatus`).
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button, Toggle, copyText, useToast } from '@/ui';
import { setToolStatus } from '@/ui/shell';
import { cn } from '@/ui/cn';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import {
  diffSnapshot,
  parseSnapshot,
  serializeSnapshot,
  validateCookieAttrs,
} from '@/shared/inspection/storage/logic';
import type { SnapshotDiff } from '@/shared/inspection/storage/logic';
import type { StorageSnapshot } from '@/shared/inspection/storage/types';
import {
  buildSwapPlan,
  createProfile,
  deriveScope,
  duplicateProfile,
  groupBySite,
  isOpenProfile,
  maskValue,
  parseProfile,
  passwordStrength,
  profilesForScope,
  refreshProfileSnapshot,
  removeProfile,
  scopeCompatibility,
  serializeProfile,
  upsertProfile,
} from './logic';
import type { PasswordStrength } from './logic';
import type {
  PersistedProfile,
  ScopeCompatibility,
  SessionProfile,
  SessionScope,
  SwapMode,
  SwapPlan,
  VaultStatus,
} from './types';
import { applySwapPlan, captureCurrentSnapshot } from './swap';
import { sessionProfilesBinding } from './settings';
import type { SessionProfilesState } from './settings';
import {
  MAX_AUTO_LOCK_MINUTES,
  MIN_AUTO_LOCK_MINUTES,
  clampAutoLockMinutes,
  vaultStore,
} from './vault-store';
import type { VaultError } from './vault-store';
import styles from './session-profiles.module.css';

/** Права web storage (обязательные): `scripting` + постоянный host-доступ. */
const STORAGE_PERMS: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };
/** Права с cookies (опциональные поверх web storage; отказ деградирует, а не роняет). */
const COOKIE_PERMS: PermissionRequest = { optional: ['scripting', 'cookies'], host: ['*://*/*'] };

let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Локализованный список причин невалидности cookie (самодостаточные ключи фичи). */
function reasonsText(codes: readonly string[]): string {
  return codes.map((c) => t(`sessionProfiles.reason.${c}`)).join(', ');
}

/** Режимы горячей замены — радио-карточки инлайн-подтверждения (копирайт v3). */
const SWAP_MODES: { id: SwapMode; label: string; help: string }[] = [
  {
    id: 'replace',
    label: 'sessionProfiles.swap.replace',
    help: 'sessionProfiles.swap.replaceHelp',
  },
  { id: 'apply', label: 'sessionProfiles.swap.apply', help: 'sessionProfiles.swap.applyHelp' },
];

/** Подтверждаемое разрушительное/значимое действие (немодальный confirm). */
type Pending =
  | { kind: 'swap'; profile: SessionProfile; plan: SwapPlan; compat: ScopeCompatibility }
  | { kind: 'delete'; profile: SessionProfile }
  | { kind: 'import'; profile: SessionProfile; diff: SnapshotDiff }
  | { kind: 'export'; profile: SessionProfile }
  | { kind: 'refresh'; profile: SessionProfile; snapshot: StorageSnapshot; diff: SnapshotDiff }
  | null;

export function SessionProfilesPanel(): JSX.Element {
  const settings = useSettings(sessionProfilesBinding);
  const state = settings.value.value;
  const persisted = state.profiles;
  const activeByOrigin = state.activeByOrigin;
  const vault = state.vault;
  // Чтение сигнала подписывает компонент на смену «ключ в памяти» (unlock/lock/auto-lock).
  const unlockedFlag = vaultStore.unlocked.value;
  const status: VaultStatus =
    vault === undefined ? 'disabled' : unlockedFlag ? 'unlocked' : 'locked';
  const needsRekey = vaultStore.needsRekey(vault);

  const [scope, setScope] = useState<SessionScope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [mode, setMode] = useState<SwapMode>('replace');
  const [cookiesDenied, setCookiesDenied] = useState(false);
  const [showOther, setShowOther] = useState(false);

  // Захват → инлайн-поле имени.
  const [captured, setCaptured] = useState<StorageSnapshot | null>(null);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  // Импорт.
  const [importText, setImportText] = useState('');

  const [pending, setPending] = useState<Pending>(null);

  // Сейф: формы пароля (включить/выключить/ре-кей), разблокировка, расшифрованный набор.
  const [vaultForm, setVaultForm] = useState<'none' | 'enable' | 'disable' | 'rekey'>('none');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [unlockPw, setUnlockPw] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [decrypted, setDecrypted] = useState<SessionProfile[] | null>(null);

  const { show } = useToast();
  const sessionRef = useRef(0);

  /**
   * Рабочий (ОТКРЫТЫЙ) набор профилей для рендера/мутаций:
   *  - `disabled` — открытые персист-профили как есть;
   *  - `unlocked` — расшифрованный набор (`decrypted`);
   *  - `locked`   — пусто (секретов нет в памяти; список рендерим по метаданным).
   */
  const profiles: SessionProfile[] = useMemo(() => {
    if (status === 'disabled') return persisted.filter(isOpenProfile);
    if (status === 'unlocked') return decrypted ?? [];
    return [];
  }, [status, persisted, decrypted]);

  // Расшифровка при разблокировке / смене зашифрованного списка. Ключ — в памяти сейфа.
  useEffect(() => {
    if (status !== 'unlocked') {
      setDecrypted(null);
      return;
    }
    let cancelled = false;
    void vaultStore.decryptProfiles(persisted).then((res) => {
      if (cancelled) return;
      if (res.ok) setDecrypted(res.value);
      else {
        setDecrypted([]);
        setError(t('sessionProfiles.vault.corrupt'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status, persisted]);

  /**
   * Единая запись списка профилей в хранилище: при включённом сейфе шифрует рабочий
   * набор (свежий IV на запись), иначе пишет открыто. Залоченный сейф не писать — это
   * защищает от затирания зашифрованных данных открытыми.
   */
  const commitProfiles = async (next: SessionProfile[]): Promise<boolean> => {
    if (vault === undefined) {
      await sessionProfilesBinding.update({ profiles: next });
      return true;
    }
    const res = await vaultStore.encryptProfiles(next);
    if (!res.ok) {
      setError(t('sessionProfiles.vault.needUnlock'));
      return false;
    }
    await sessionProfilesBinding.update({ profiles: res.value });
    return true;
  };

  /** Локализованный текст кода ошибки сейфа. */
  const vaultErrorText = (code: VaultError): string => t(`sessionProfiles.vault.err.${code}`);

  const resetVaultForm = (): void => {
    setVaultForm('none');
    setPw1('');
    setPw2('');
    setUnderstood(false);
    setVaultError('');
  };

  /**
   * Оптимистично отражает записанное сейфом состояние в реактивный сигнал биндинга.
   */
  const reflectVaultState = (next: SessionProfilesState): void => {
    sessionProfilesBinding.value.value = next;
  };

  /** Включение защиты: пароль + подтверждение → миграция namespace в зашифрованный вид. */
  const onEnableSubmit = (): void => {
    if (vaultBusy || !understood) return;
    if (pw1.length === 0) {
      setVaultError(t('sessionProfiles.vault.err.empty'));
      return;
    }
    if (pw1 !== pw2) {
      setVaultError(t('sessionProfiles.vault.err.mismatch'));
      return;
    }
    setVaultBusy(true);
    void (async () => {
      try {
        const res = await vaultStore.enableEncryption(pw1);
        if (!res.ok) {
          setVaultError(vaultErrorText(res.error));
          return;
        }
        reflectVaultState(res.value);
        resetVaultForm();
        setReport(t('sessionProfiles.vault.report.enabled'));
      } catch (e) {
        logger.error('session-profiles/vault', e);
        setVaultError(t('sessionProfiles.error.generic'));
      } finally {
        setVaultBusy(false);
      }
    })();
  };

  /** Выключение защиты / ре-кей: один пароль (текущий) + подтверждение действия. */
  const onPasswordAction = (kind: 'disable' | 'rekey'): void => {
    if (vaultBusy) return;
    if (pw1.length === 0) {
      setVaultError(t('sessionProfiles.vault.err.empty'));
      return;
    }
    setVaultBusy(true);
    void (async () => {
      try {
        const res =
          kind === 'disable'
            ? await vaultStore.disableEncryption(pw1)
            : await vaultStore.rekey(pw1);
        if (!res.ok) {
          setVaultError(vaultErrorText(res.error));
          return;
        }
        reflectVaultState(res.value);
        resetVaultForm();
        setReport(
          t(
            kind === 'disable'
              ? 'sessionProfiles.vault.report.disabled'
              : 'sessionProfiles.vault.report.rekeyed',
          ),
        );
      } catch (e) {
        logger.error('session-profiles/vault', e);
        setVaultError(t('sessionProfiles.error.generic'));
      } finally {
        setVaultBusy(false);
      }
    })();
  };

  /** Разблокировка сейфа введённым паролем (проверка через verifier-canary). */
  const onUnlock = (): void => {
    if (vaultBusy || unlockPw.length === 0) return;
    setVaultBusy(true);
    setUnlockError('');
    void (async () => {
      try {
        const res = await vaultStore.unlock(unlockPw);
        if (!res.ok) {
          setUnlockError(vaultErrorText(res.error));
          return;
        }
        setUnlockPw('');
        setReport(t('sessionProfiles.vault.report.unlocked'));
      } catch (e) {
        logger.error('session-profiles/vault', e);
        setUnlockError(t('sessionProfiles.error.generic'));
      } finally {
        setVaultBusy(false);
      }
    })();
  };

  const onLock = (): void => {
    vaultStore.lock();
    setReport(t('sessionProfiles.vault.report.locked'));
  };

  const autoLockMinutes = clampAutoLockMinutes(state.autoLockMinutes);
  const onAutoLockChange = (minutes: number): void => {
    const clamped = clampAutoLockMinutes(minutes);
    vaultStore.setAutoLockMinutes(clamped);
    reflectVaultState({ ...state, autoLockMinutes: clamped });
    void sessionProfilesBinding.update({ autoLockMinutes: clamped });
  };

  /** Включает/выключает защиту через переключатель v3 (открывает нужную форму). */
  const onToggleVault = (): void => {
    setVaultError('');
    setVaultForm(status === 'disabled' ? 'enable' : 'disable');
  };

  /** Общий враппер: токен сессии, сброс ошибки, `busy` со сбросом в `finally`. */
  const run = async (fn: (isCurrent: () => boolean) => Promise<void>): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;
    setError('');
    setBusy(true);
    try {
      await fn(isCurrent);
    } catch (e) {
      logger.error('session-profiles', e);
      if (isCurrent()) setError(t('sessionProfiles.error.generic'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /** Гарантирует права и возвращает id активной вкладки (или null при отказе/ошибке). */
  const ensureTab = async (
    request: PermissionRequest,
    isCurrent: () => boolean,
  ): Promise<number | null> => {
    const granted = await getBroker().ensure(request);
    if (!isCurrent()) return null;
    if (!granted) {
      setError(t('sessionProfiles.error.permissionDenied'));
      return null;
    }
    const tabId = await tabs.queryActive();
    if (!isCurrent()) return null;
    if (tabId === undefined) {
      setError(t('sessionProfiles.error.noTab'));
      return null;
    }
    return tabId;
  };

  /** Безопасно читает URL вкладки и выводит область (без права host вернёт null). */
  const readScope = async (tabId: number): Promise<SessionScope | null> => {
    let url: string | undefined;
    try {
      url = await tabs.getUrl(tabId);
    } catch {
      url = undefined;
    }
    return url !== undefined ? deriveScope(url) : null;
  };

  /** На монтировании/обновлении: активная вкладка → URL → область. */
  const refresh = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('sessionProfiles.error.noTab'));
        return;
      }
      const sc = await readScope(tabId);
      if (!isCurrent()) return;
      setScope(sc);
    });

  useEffect(() => {
    // Только при первом монтировании панели (осознанно пустой список зависимостей).
    void refresh();
  }, []);

  /** Захват текущей сессии: права → снимок → инлайн-поле имени. */
  const onCapture = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      setCookiesDenied(!withCookies);
      const sc = scope ?? (await readScope(tabId));
      if (!isCurrent()) return;
      if (sc === null) {
        setError(t('sessionProfiles.error.noScope'));
        return;
      }
      setScope(sc);
      const snapshot = await captureCurrentSnapshot(tabId, { withCookies });
      if (!isCurrent()) return;
      setCaptured(snapshot);
      setNaming(true);
      setDraftName('');
      setReport(t('sessionProfiles.report.captured'));
    });

  /** Сохраняет захваченный снимок под введённым именем. */
  const onCreateProfile = (): void => {
    const name = draftName.trim();
    if (name === '' || captured === null || scope === null) return;
    const profile = createProfile({ name, scope, snapshot: captured, now: Date.now() });
    const origin = scope.origin;
    // Снимок = живая сессия, значит новый профиль сразу активен для origin. Пишем строго
    // после commitProfiles (в т.ч. после шифрования сейфом), чтобы записи не перетёрли друг друга.
    void (async () => {
      const saved = await commitProfiles(upsertProfile(profiles, profile));
      if (!saved) return;
      await sessionProfilesBinding.update({
        activeByOrigin: { ...activeByOrigin, [origin]: profile.id },
      });
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : t('sessionProfiles.error.generic'));
    });
    setNaming(false);
    setCaptured(null);
    setDraftName('');
    setReport(t('sessionProfiles.report.saved'));
  };

  /** Шаг 1 свапа: снимаем текущее, строим план, показываем подтверждение. */
  const onSwitch = (profile: SessionProfile): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      setCookiesDenied(!withCookies);
      const current = await captureCurrentSnapshot(tabId, { withCookies });
      if (!isCurrent()) return;
      const plan = buildSwapPlan(current, profile.snapshot, mode);
      const compat: ScopeCompatibility =
        scope !== null ? scopeCompatibility(profile.scope, scope) : { compatible: true };
      setPending({ kind: 'swap', profile, plan, compat });
    });

  /** Шаг 2 свапа (после подтверждения): применяем план, отчитываемся, метим активный. */
  const applySwap = (profile: SessionProfile, plan: SwapPlan): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      setCookiesDenied(!withCookies);
      const res = await applySwapPlan(tabId, plan, { withCookies, reload: true });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(
          res.error.messageKey ? t(res.error.messageKey) : t('sessionProfiles.error.generic'),
        );
        return;
      }
      setReport(
        t('sessionProfiles.report.swapped', {
          applied: res.value.applied,
          removed: res.value.removed,
        }),
      );
      if (scope !== null) {
        await sessionProfilesBinding.update({
          activeByOrigin: { ...activeByOrigin, [scope.origin]: profile.id },
        });
      }
    });

  /**
   * Шаг 1 пересъёмки: снимаем ТЕКУЩУЮ сессию вкладки, считаем diff к сохранённому снимку и
   * просим подтвердить перезапись (ротируемые refresh-токены делают старый снимок мёртвым).
   */
  const onRefresh = (profile: SessionProfile): Promise<void> =>
    run(async (isCurrent) => {
      // Defense-in-depth: сессию чужого origin с текущей вкладки не снять.
      if (scope === null) {
        setError(t('sessionProfiles.error.noScope'));
        return;
      }
      const compat = scopeCompatibility(profile.scope, scope);
      if (!compat.compatible) {
        setError(
          compat.reason === 'domain-mismatch'
            ? t('sessionProfiles.scopeMismatch.domain')
            : t('sessionProfiles.scopeMismatch.origin'),
        );
        return;
      }
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      setCookiesDenied(!withCookies);
      const snapshot = await captureCurrentSnapshot(tabId, { withCookies });
      if (!isCurrent()) return;
      const diff = diffSnapshot(profile.snapshot, snapshot);
      setPending({ kind: 'refresh', profile, snapshot, diff });
    });

  /** Шаг 2 пересъёмки (после подтверждения): перезаписываем снимок на месте и метим активный. */
  const applyRefresh = (profile: SessionProfile, snapshot: StorageSnapshot): void => {
    const updated = refreshProfileSnapshot(profile, snapshot, Date.now());
    const origin = scope?.origin;
    // Свежий снимок = живая сессия → профиль активен для origin. Пишем строго после commitProfiles.
    void (async () => {
      const saved = await commitProfiles(upsertProfile(profiles, updated));
      if (!saved) return;
      if (origin !== undefined) {
        await sessionProfilesBinding.update({
          activeByOrigin: { ...activeByOrigin, [origin]: profile.id },
        });
      }
      setReport(t('sessionProfiles.report.refreshed'));
    })().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : t('sessionProfiles.error.generic'));
    });
  };

  const onDuplicate = (profile: SessionProfile): void => {
    void commitProfiles(duplicateProfile(profiles, profile.id, Date.now()));
    setReport(t('sessionProfiles.report.duplicated'));
  };

  const applyDelete = (profile: SessionProfile): void => {
    void commitProfiles(removeProfile(profiles, profile.id));
    setReport(t('sessionProfiles.report.deleted'));
  };

  /** Правка профиля: валидирует cookies перед сохранением; ошибку возвращает наверх. */
  const onEditSave = (
    profile: SessionProfile,
    name: string,
    snapshotText: string,
  ): string | null => {
    const parsed = parseSnapshot(snapshotText);
    if (!parsed.ok) return t('sessionProfiles.error.invalidSnapshot');
    for (const c of parsed.value.cookies) {
      const check = validateCookieAttrs(c);
      if (!check.valid) {
        return t('sessionProfiles.error.invalidCookie', { reasons: reasonsText(check.errors) });
      }
    }
    const updated: SessionProfile = {
      ...profile,
      name: name.trim() === '' ? profile.name : name.trim(),
      snapshot: parsed.value,
      updatedAt: Date.now(),
    };
    void commitProfiles(upsertProfile(profiles, updated));
    setReport(t('sessionProfiles.report.saved'));
    return null;
  };

  /** Копирует профиль в буфер РАСШИФРОВАННЫМ JSON (конверт TASK-047). */
  const doExport = (profile: SessionProfile): void => {
    void copyText(serializeProfile(profile)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  /** Экспорт: при выключенном сейфе — сразу; при включённом — подтверждение (файл открытый). */
  const onExport = (profile: SessionProfile): void => {
    if (vault === undefined) {
      doExport(profile);
      return;
    }
    setPending({ kind: 'export', profile });
  };

  /** Импорт: парсим конверт → снимаем текущее → diff-превью → подтверждение. */
  const onPreviewImport = (): Promise<void> =>
    run(async (isCurrent) => {
      const parsed = parseProfile(importText);
      if (!parsed.ok) {
        setError(t('sessionProfiles.error.importInvalid'));
        return;
      }
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      setCookiesDenied(!withCookies);
      const current = await captureCurrentSnapshot(tabId, { withCookies });
      if (!isCurrent()) return;
      const diff = diffSnapshot(current, parsed.value.snapshot);
      setPending({ kind: 'import', profile: parsed.value, diff });
    });

  const applyImport = (profile: SessionProfile): void => {
    void commitProfiles(upsertProfile(profiles, profile));
    setImportText('');
    setReport(t('sessionProfiles.report.imported'));
  };

  const confirmPending = (): void => {
    const p = pending;
    setPending(null);
    if (p === null) return;
    if (p.kind === 'swap') void applySwap(p.profile, p.plan);
    else if (p.kind === 'delete') applyDelete(p.profile);
    else if (p.kind === 'export') doExport(p.profile);
    else if (p.kind === 'refresh') applyRefresh(p.profile, p.snapshot);
    else applyImport(p.profile);
  };

  // ── производные списки ────────────────────────────────────────────────────
  const currentProfiles = useMemo(
    () => (scope !== null ? profilesForScope(profiles, scope) : []),
    [profiles, scope],
  );
  const otherGroups = useMemo(() => {
    const others =
      scope !== null ? profiles.filter((p) => p.scope.origin !== scope.origin) : profiles;
    return groupBySite(others);
  }, [profiles, scope]);

  const activeId = scope !== null ? activeByOrigin[scope.origin] : undefined;

  // Метаданные профилей текущего сайта (для залоченного списка — имена видны без ключа).
  const currentMeta = useMemo<readonly PersistedProfile[]>(
    () => (scope !== null ? profilesForScope(persisted, scope) : []),
    [persisted, scope],
  );

  // Имя активного профиля текущего сайта → зеркалим в статус оболочки.
  const activeName = useMemo(
    () => currentProfiles.find((p) => p.id === activeId)?.name ?? '',
    [currentProfiles, activeId],
  );
  // setToolStatus пишет в сигнал оболочки: вызов внутри teardown Preact падает на
  // `__k` → откладываем в микротаск (и при размонтировании тоже).
  useEffect(() => {
    const next = activeName !== '' ? { live: false, text: activeName } : null;
    queueMicrotask(() => {
      setToolStatus('session-profiles', next);
    });
    return () => {
      queueMicrotask(() => {
        setToolStatus('session-profiles', null);
      });
    };
  }, [activeName]);

  // Хост текущей области для строки сайта.
  const siteHost = useMemo(() => {
    if (scope === null) return '';
    try {
      return new URL(scope.origin).host;
    } catch {
      return scope.cookieDomain;
    }
  }, [scope]);

  const renderProfileCard = (
    p: SessionProfile,
    active: boolean,
    canRefresh: boolean,
  ): JSX.Element => (
    <ProfileCard
      key={p.id}
      profile={p}
      active={active}
      canRefresh={canRefresh}
      onRefresh={() => {
        void onRefresh(p);
      }}
      busy={busy}
      confirming={pending?.kind === 'swap' && pending.profile.id === p.id}
      swapCompat={pending?.kind === 'swap' && pending.profile.id === p.id ? pending.compat : null}
      mode={mode}
      onMode={setMode}
      onSwitch={() => {
        void onSwitch(p);
      }}
      onConfirmSwap={confirmPending}
      onCancelSwap={() => {
        setPending(null);
      }}
      onDuplicate={() => {
        onDuplicate(p);
      }}
      onDelete={() => {
        setPending({ kind: 'delete', profile: p });
      }}
      onExport={() => {
        onExport(p);
      }}
      onEditSave={(name, text) => onEditSave(p, name, text)}
    />
  );

  return (
    <div class={styles.panel} data-testid="session-profiles">
      {siteHost !== '' ? (
        <div class={styles.siteLine}>
          <span class={styles.siteDot} aria-hidden="true" />
          <span class={styles.siteHost}>{siteHost}</span>
          <span>{t('sessionProfiles.currentTab')}</span>
        </div>
      ) : null}

      {status !== 'locked' ? (
        <>
          <Button
            block
            loading={busy}
            disabled={busy}
            onClick={() => {
              void onCapture();
            }}
          >
            {t('sessionProfiles.saveLogin')}
          </Button>
          <p class={styles.saveHelp}>{t('sessionProfiles.saveLoginHelp')}</p>
        </>
      ) : null}

      {naming ? (
        <div class={styles.form}>
          <label class={styles.label} for="sp-name">
            {t('sessionProfiles.name')}
          </label>
          <input
            id="sp-name"
            class={styles.input}
            placeholder={t('sessionProfiles.namePlaceholder')}
            value={draftName}
            onInput={(e) => {
              setDraftName(e.currentTarget.value);
            }}
          />
          <div class={styles.formActions}>
            <button
              type="button"
              class={styles.primaryBtn}
              disabled={draftName.trim() === ''}
              onClick={onCreateProfile}
            >
              {t('sessionProfiles.create')}
            </button>
            <button
              type="button"
              class={styles.ghostBtn}
              onClick={() => {
                setNaming(false);
                setCaptured(null);
              }}
            >
              {t('sessionProfiles.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {cookiesDenied ? (
        <p class={styles.note} role="status" data-testid="sp-cookies-note">
          {t('sessionProfiles.cookiesNote')}
        </p>
      ) : null}

      {error !== '' ? (
        <p role="alert" class={styles.error} data-testid="sp-error">
          {error}
        </p>
      ) : null}

      {report !== '' ? (
        <p class={styles.report} role="status" aria-live="polite" data-testid="sp-report">
          {report}
        </p>
      ) : null}

      {/* Подтверждение удаления/импорта/экспорта (своп подтверждается инлайн в карточке). */}
      {pending !== null && pending.kind !== 'swap' ? (
        <div class={styles.confirm} role="alertdialog" aria-label={t('sessionProfiles.confirm')}>
          {pending.kind === 'delete' ? (
            <p>{t('sessionProfiles.confirmDelete', { name: pending.profile.name })}</p>
          ) : null}
          {pending.kind === 'export' ? (
            <p data-testid="sp-export-warn">
              {t('sessionProfiles.vault.exportWarn', { name: pending.profile.name })}
            </p>
          ) : null}
          {pending.kind === 'refresh' ? (
            <>
              <p data-testid="sp-refresh-warn">
                {t('sessionProfiles.confirmRefresh', { name: pending.profile.name })}
              </p>
              <p class={styles.diff} data-testid="sp-refresh-diff">
                {t('sessionProfiles.diff', {
                  added: pending.diff.total.added,
                  changed: pending.diff.total.changed,
                  removed: pending.diff.total.removed,
                })}
              </p>
            </>
          ) : null}
          {pending.kind === 'import' ? (
            <>
              <p>{t('sessionProfiles.confirmImport', { name: pending.profile.name })}</p>
              <p class={styles.diff} data-testid="sp-import-diff">
                {t('sessionProfiles.diff', {
                  added: pending.diff.total.added,
                  changed: pending.diff.total.changed,
                  removed: pending.diff.total.removed,
                })}
              </p>
            </>
          ) : null}
          <div class={styles.confirmActions}>
            <Button variant="danger" onClick={confirmPending}>
              {t('sessionProfiles.confirm')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPending(null);
              }}
            >
              {t('sessionProfiles.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── профили текущего сайта ─────────────────────────────────────────── */}
      {status === 'locked' ? (
        <div class={styles.cardList} data-testid="sp-locked-list">
          {currentMeta.length === 0 ? (
            <div class={styles.empty}>{t('sessionProfiles.vault.lockedEmpty')}</div>
          ) : (
            currentMeta.map((p) => (
              <div key={p.id} class={styles.card} data-testid="sp-locked-card">
                <div class={styles.cardHeader}>
                  <span class={styles.avatar} aria-hidden="true">
                    🔒
                  </span>
                  <div class={styles.cardInfo}>
                    <span class={styles.cardName} title={p.name}>
                      {p.name}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div class={styles.cardList} data-testid="sp-current-list">
          {currentProfiles.length === 0 ? (
            <div class={styles.empty}>{t('sessionProfiles.empty')}</div>
          ) : (
            currentProfiles.map((p) => renderProfileCard(p, p.id === activeId, true))
          )}
        </div>
      )}

      {/* ── профили других сайтов ──────────────────────────────────────────── */}
      {status !== 'locked' && otherGroups.length > 0 ? (
        <div class={styles.section}>
          <button
            type="button"
            class={styles.ghostBtn}
            aria-expanded={showOther}
            onClick={() => {
              setShowOther((v) => !v);
            }}
          >
            {t('sessionProfiles.otherSites')} ({otherGroups.length})
          </button>
          {showOther ? (
            <div class={styles.cardList} data-testid="sp-other-list">
              {otherGroups.map((g) => (
                <div key={g.origin} class={styles.entryGroup}>
                  <span class={styles.entryGroupHead} title={g.origin}>
                    {g.origin}
                  </span>
                  {g.profiles.map((p) =>
                    renderProfileCard(p, p.id === activeByOrigin[p.scope.origin], false),
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── сейф: защита паролем ───────────────────────────────────────────── */}
      <div class={styles.vault} data-testid="sp-vault">
        <div class={styles.card}>
          <Toggle
            variant="plain"
            class={styles.vaultToggle}
            label={t('sessionProfiles.protect')}
            help={t('sessionProfiles.protectHelp')}
            checked={status !== 'disabled'}
            onChange={onToggleVault}
          />
        </div>

        {status === 'unlocked' && vaultForm === 'none' ? (
          <div class={styles.vaultRow}>
            <button
              type="button"
              class={styles.ghostBtn}
              data-testid="sp-vault-lock"
              onClick={onLock}
            >
              {t('sessionProfiles.vault.lock')}
            </button>
            {needsRekey ? (
              <button
                type="button"
                class={styles.ghostBtn}
                data-testid="sp-vault-rekey"
                onClick={() => {
                  setVaultError('');
                  setVaultForm('rekey');
                }}
              >
                {t('sessionProfiles.vault.rekey')}
              </button>
            ) : null}
          </div>
        ) : null}

        <p class={styles.saveHelp} data-testid="sp-vault-note">
          {status === 'disabled'
            ? t('sessionProfiles.localTrustNote')
            : t('sessionProfiles.vault.threatNote')}
        </p>

        {vaultForm === 'enable' ? (
          <div class={styles.form} data-testid="sp-vault-enable-form">
            <PasswordInput
              id="sp-pw1"
              label={t('sessionProfiles.vault.password')}
              value={pw1}
              onValue={setPw1}
              onEnter={onEnableSubmit}
            />
            <PasswordInput
              id="sp-pw2"
              label={t('sessionProfiles.vault.confirm')}
              value={pw2}
              onValue={setPw2}
              onEnter={onEnableSubmit}
            />
            {pw1 !== '' ? <StrengthMeter level={passwordStrength(pw1)} /> : null}
            <p class={styles.saveHelp}>{t('sessionProfiles.vault.noRecovery')}</p>
            <label class={styles.checkRow}>
              <input
                type="checkbox"
                checked={understood}
                data-testid="sp-vault-understand"
                onChange={(e) => {
                  setUnderstood(e.currentTarget.checked);
                }}
              />
              <span>{t('sessionProfiles.vault.understand')}</span>
            </label>
            {vaultError !== '' ? (
              <p role="alert" class={styles.error} data-testid="sp-vault-error">
                {vaultError}
              </p>
            ) : null}
            <div class={styles.formActions}>
              <button
                type="button"
                class={styles.primaryBtn}
                disabled={vaultBusy || !understood}
                data-testid="sp-vault-enable-submit"
                onClick={onEnableSubmit}
              >
                {t('sessionProfiles.vault.enableConfirm')}
              </button>
              <button type="button" class={styles.ghostBtn} onClick={resetVaultForm}>
                {t('sessionProfiles.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        {vaultForm === 'disable' || vaultForm === 'rekey' ? (
          <div class={styles.form} data-testid="sp-vault-pw-form">
            <p class={styles.saveHelp}>
              {vaultForm === 'disable'
                ? t('sessionProfiles.vault.disableWarn')
                : t('sessionProfiles.vault.rekeyWarn')}
            </p>
            <PasswordInput
              id="sp-pw-current"
              label={t('sessionProfiles.vault.currentPassword')}
              value={pw1}
              onValue={setPw1}
              onEnter={() => {
                onPasswordAction(vaultForm === 'disable' ? 'disable' : 'rekey');
              }}
            />
            {vaultError !== '' ? (
              <p role="alert" class={styles.error} data-testid="sp-vault-error">
                {vaultError}
              </p>
            ) : null}
            <div class={styles.formActions}>
              <button
                type="button"
                class={vaultForm === 'disable' ? styles.dangerBtn : styles.primaryBtn}
                disabled={vaultBusy}
                data-testid="sp-vault-pw-submit"
                onClick={() => {
                  onPasswordAction(vaultForm === 'disable' ? 'disable' : 'rekey');
                }}
              >
                {t(
                  vaultForm === 'disable'
                    ? 'sessionProfiles.vault.disableConfirm'
                    : 'sessionProfiles.vault.rekeyConfirm',
                )}
              </button>
              <button type="button" class={styles.ghostBtn} onClick={resetVaultForm}>
                {t('sessionProfiles.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        {status === 'locked' ? (
          <div class={styles.form} data-testid="sp-unlock-form">
            <PasswordInput
              id="sp-unlock"
              label={t('sessionProfiles.vault.password')}
              value={unlockPw}
              onValue={setUnlockPw}
              onEnter={onUnlock}
              inputTestId="sp-unlock-input"
            />
            <p
              role="alert"
              aria-live="assertive"
              class={styles.error}
              data-testid="sp-unlock-error"
            >
              {unlockError}
            </p>
            <div class={styles.formActions}>
              <button
                type="button"
                class={styles.primaryBtn}
                disabled={vaultBusy || unlockPw === ''}
                data-testid="sp-unlock-submit"
                onClick={onUnlock}
              >
                {t('sessionProfiles.vault.unlock')}
              </button>
            </div>
          </div>
        ) : null}

        {status === 'unlocked' ? (
          <div class={styles.autoLockRow}>
            <label class={styles.label} for="sp-autolock">
              {t('sessionProfiles.vault.autoLock')}
            </label>
            <input
              id="sp-autolock"
              type="number"
              min={MIN_AUTO_LOCK_MINUTES}
              max={MAX_AUTO_LOCK_MINUTES}
              class={styles.input}
              value={autoLockMinutes}
              data-testid="sp-autolock"
              onChange={(e) => {
                onAutoLockChange(Number(e.currentTarget.value));
              }}
            />
            <span class={styles.hint}>{t('sessionProfiles.vault.autoLockHint')}</span>
          </div>
        ) : null}
      </div>

      {/* ── импорт профиля ─────────────────────────────────────────────────── */}
      {status !== 'locked' ? (
        <div class={styles.importBox}>
          <label class={styles.label} for="sp-import-text">
            {t('sessionProfiles.import')}
          </label>
          <textarea
            id="sp-import-text"
            class={styles.area}
            placeholder={t('sessionProfiles.importPlaceholder')}
            value={importText}
            data-testid="sp-import-text"
            onInput={(e) => {
              setImportText(e.currentTarget.value);
            }}
          />
          <button
            type="button"
            class={styles.ghostBtn}
            disabled={busy || importText.trim() === ''}
            onClick={() => {
              void onPreviewImport();
            }}
          >
            {t('sessionProfiles.importPreview')}
          </button>
        </div>
      ) : null}

      <p class={styles.footer}>{t('sessionProfiles.footerNote')}</p>
    </div>
  );
}

// ── поле пароля с показать/скрыть ───────────────────────────────────────────────

interface PasswordInputProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  /** Enter в поле запускает это действие (сабмит формы без мыши). */
  readonly onEnter?: () => void;
  /** data-testid на само поле ввода (для e2e/unit-хуков). */
  readonly inputTestId?: string;
}

/**
 * Поле мастер-пароля с переключателем видимости. Показ введённого ДО коммита критичен:
 * у сейфа нет восстановления — опечатка в пароле иначе навсегда закрыла бы доступ.
 */
function PasswordInput(props: PasswordInputProps): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <>
      <label class={styles.label} for={props.id}>
        {props.label}
      </label>
      <div class={styles.pwRow}>
        <input
          id={props.id}
          type={show ? 'text' : 'password'}
          class={cn(styles.input, styles.pwInput)}
          value={props.value}
          {...(props.inputTestId !== undefined ? { 'data-testid': props.inputTestId } : {})}
          onInput={(e) => {
            props.onValue(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && props.onEnter) props.onEnter();
          }}
        />
        <button
          type="button"
          class={styles.pwToggle}
          aria-pressed={show}
          aria-label={t(
            show ? 'sessionProfiles.vault.hidePassword' : 'sessionProfiles.vault.showPassword',
          )}
          onClick={() => {
            setShow((v) => !v);
          }}
        >
          {t(show ? 'sessionProfiles.vault.hide' : 'sessionProfiles.vault.show')}
        </button>
      </div>
    </>
  );
}

// ── индикатор надёжности пароля (полоска + подпись) ─────────────────────────────

const STRENGTH_PCT: Record<PasswordStrength, number> = { weak: 30, fair: 60, strong: 100 };
const STRENGTH_FILL: Record<PasswordStrength, string | undefined> = {
  weak: styles.strengthWeak,
  fair: styles.strengthFair,
  strong: styles.strengthStrong,
};

function StrengthMeter({ level }: { readonly level: PasswordStrength }): JSX.Element {
  return (
    <div class={styles.strength} data-testid="sp-pw-strength">
      <div class={styles.strengthBar}>
        <div
          class={cn(styles.strengthFill, STRENGTH_FILL[level])}
          style={{ width: `${String(STRENGTH_PCT[level])}%` }}
        />
      </div>
      <span class={styles.strengthLabel}>{t(`sessionProfiles.vault.strength.${level}`)}</span>
    </div>
  );
}

// ── карточка профиля (v3) ───────────────────────────────────────────────────────

interface ProfileCardProps {
  readonly profile: SessionProfile;
  readonly active: boolean;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly swapCompat: ScopeCompatibility | null;
  readonly mode: SwapMode;
  readonly onMode: (mode: SwapMode) => void;
  readonly onSwitch: () => void;
  readonly onConfirmSwap: () => void;
  readonly onCancelSwap: () => void;
  /** Пересъёмка доступна только карточкам текущего сайта (чужой origin со вкладки не снять). */
  readonly canRefresh: boolean;
  readonly onRefresh: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onExport: () => void;
  /** Валидирует и сохраняет; возвращает локализованную ошибку или null при успехе. */
  readonly onEditSave: (name: string, snapshotText: string) => string | null;
}

function ProfileCard(props: ProfileCardProps): JSX.Element {
  const p = props.profile;
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(p.name);
  const [draftSnapshot, setDraftSnapshot] = useState(() => serializeSnapshot(p.snapshot));
  const [cardError, setCardError] = useState('');

  const initial = (p.name.trim().charAt(0) || '?').toUpperCase();
  const keys = p.snapshot.local.length + p.snapshot.session.length;
  const meta = t('sessionProfiles.cardMeta', {
    date: new Date(p.updatedAt).toLocaleDateString(),
    cookies: p.snapshot.cookies.length,
    keys,
  });
  const scopeWarn =
    props.swapCompat !== null && !props.swapCompat.compatible
      ? props.swapCompat.reason === 'domain-mismatch'
        ? t('sessionProfiles.scopeMismatch.domain')
        : t('sessionProfiles.scopeMismatch.origin')
      : '';

  const shown = (value: string): string => (revealed ? value : maskValue(value));

  const startEdit = (): void => {
    setDraftName(p.name);
    setDraftSnapshot(serializeSnapshot(p.snapshot));
    setCardError('');
    setEditing(true);
    setOpen(true);
  };

  const saveEdit = (): void => {
    const err = props.onEditSave(draftName, draftSnapshot);
    if (err !== null) {
      setCardError(err);
      return;
    }
    setCardError('');
    setEditing(false);
  };

  return (
    <div class={cn(styles.card, props.active && styles.cardActive)}>
      <div class={styles.cardHeader}>
        <span class={cn(styles.avatar, props.active && styles.avatarActive)} aria-hidden="true">
          {initial}
        </span>
        <div class={styles.cardInfo}>
          <span class={styles.cardName} title={p.name}>
            {p.name}
          </span>
          <span class={styles.cardMeta}>{meta}</span>
        </div>
        {props.active ? (
          <span class={styles.activeBadge}>{t('sessionProfiles.active')}</span>
        ) : (
          <button
            type="button"
            class={styles.switchBtn}
            disabled={props.busy}
            data-testid="sp-switch"
            onClick={props.onSwitch}
          >
            {t('sessionProfiles.switch')}
          </button>
        )}
        <button
          type="button"
          class={styles.expandBtn}
          aria-expanded={open}
          aria-label={t('sessionProfiles.details')}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          {open ? '▾' : '▸'}
        </button>
      </div>

      {props.confirming ? (
        <div class={styles.confirmInline} role="group" aria-label={t('sessionProfiles.confirm')}>
          <div
            role="radiogroup"
            class={styles.radioGroup}
            aria-label={t('sessionProfiles.mode.label')}
          >
            {SWAP_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={props.mode === m.id}
                class={cn(styles.radioCard, props.mode === m.id && styles.radioOn)}
                onClick={() => {
                  props.onMode(m.id);
                }}
              >
                <span class={styles.radioDot} aria-hidden="true" />
                <span class={styles.radioText}>
                  <span class={styles.radioLabel}>{t(m.label)}</span>
                  <span class={styles.radioHelp}>{t(m.help)}</span>
                </span>
              </button>
            ))}
          </div>
          {scopeWarn !== '' ? (
            <p class={styles.scopeWarn} data-testid="sp-scope-warn">
              {scopeWarn}
            </p>
          ) : null}
          <div class={styles.formActions}>
            <button
              type="button"
              class={styles.primaryBtn}
              disabled={props.busy}
              data-testid="sp-swap-confirm"
              onClick={props.onConfirmSwap}
            >
              {t('sessionProfiles.swapReload')}
            </button>
            <button type="button" class={styles.ghostBtn} onClick={props.onCancelSwap}>
              {t('sessionProfiles.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div class={styles.cardBody}>
          {editing ? (
            <>
              <label class={styles.label} for={`sp-edit-name-${p.id}`}>
                {t('sessionProfiles.name')}
              </label>
              <input
                id={`sp-edit-name-${p.id}`}
                class={styles.input}
                value={draftName}
                onInput={(e) => {
                  setDraftName(e.currentTarget.value);
                }}
              />
              <label class={styles.label} for={`sp-edit-snap-${p.id}`}>
                {t('sessionProfiles.snapshotJson')}
              </label>
              <textarea
                id={`sp-edit-snap-${p.id}`}
                class={styles.area}
                value={draftSnapshot}
                aria-label={t('sessionProfiles.snapshotJson')}
                onInput={(e) => {
                  setDraftSnapshot(e.currentTarget.value);
                }}
              />
              {cardError !== '' ? (
                <p role="alert" class={styles.error}>
                  {cardError}
                </p>
              ) : null}
              <div class={styles.actions}>
                <button
                  type="button"
                  class={styles.primaryBtn}
                  disabled={props.busy}
                  onClick={saveEdit}
                >
                  {t('sessionProfiles.save')}
                </button>
                <button
                  type="button"
                  class={styles.ghostBtn}
                  onClick={() => {
                    setEditing(false);
                    setCardError('');
                  }}
                >
                  {t('sessionProfiles.cancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <EntryGroup
                head={t('sessionProfiles.cookies')}
                rows={p.snapshot.cookies.map((c) => ({ key: c.name, value: shown(c.value) }))}
              />
              <EntryGroup
                head={t('sessionProfiles.local')}
                rows={p.snapshot.local.map((e) => ({ key: e.key, value: shown(e.value) }))}
              />
              <EntryGroup
                head={t('sessionProfiles.session')}
                rows={p.snapshot.session.map((e) => ({ key: e.key, value: shown(e.value) }))}
              />
              <div class={styles.actions}>
                <button
                  type="button"
                  class={styles.ghostBtn}
                  aria-pressed={revealed}
                  onClick={() => {
                    setRevealed((v) => !v);
                  }}
                >
                  {revealed ? t('sessionProfiles.mask') : t('sessionProfiles.reveal')}
                </button>
                <button type="button" class={styles.ghostBtn} onClick={startEdit}>
                  {t('sessionProfiles.edit')}
                </button>
                {props.canRefresh ? (
                  <button
                    type="button"
                    class={styles.ghostBtn}
                    disabled={props.busy}
                    data-testid="sp-refresh"
                    onClick={props.onRefresh}
                  >
                    {t('sessionProfiles.refresh')}
                  </button>
                ) : null}
                <button type="button" class={styles.ghostBtn} onClick={props.onDuplicate}>
                  {t('sessionProfiles.duplicate')}
                </button>
                <button type="button" class={styles.ghostBtn} onClick={props.onExport}>
                  {t('sessionProfiles.export')}
                </button>
                <button
                  type="button"
                  class={styles.dangerBtn}
                  disabled={props.busy}
                  onClick={props.onDelete}
                >
                  {t('sessionProfiles.delete')}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface EntryGroupProps {
  readonly head: string;
  readonly rows: { key: string; value: string }[];
}

function EntryGroup(props: EntryGroupProps): JSX.Element | null {
  if (props.rows.length === 0) return null;
  return (
    <div class={styles.entryGroup}>
      <span class={styles.entryGroupHead}>{props.head}</span>
      {props.rows.map((r) => (
        <div key={r.key} class={styles.entryRow}>
          <span class={styles.entryKey} title={r.key}>
            {r.key}
          </span>
          <span class={styles.entryVal}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

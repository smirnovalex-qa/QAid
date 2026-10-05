import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

// Управляемое право cookies (scripting всегда выдан; cookies — тумблер между тестами).
let cookiesGranted = true;

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));

vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return {
    ...actual,
    tabs: {
      ...actual.tabs,
      queryActive: () => Promise.resolve(1),
      getUrl: () => Promise.resolve('https://x.test/app'),
      reload: () => Promise.resolve(),
    },
  };
});

vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  const decide = (req: { optional?: string[] }): boolean =>
    req.optional?.includes('cookies') ? cookiesGranted : true;
  return {
    ...actual,
    createPermissionBroker: () => ({
      ensure: (req: { optional?: string[] }) => Promise.resolve(decide(req)),
      has: (req: { optional?: string[] }) => Promise.resolve(decide(req)),
    }),
  };
});

// Мокаем сам swap-слой (он ходит в браузер под капотом) — UI-тесты остаются точечными.
vi.mock('../swap', () => ({
  captureCurrentSnapshot: vi.fn(() =>
    Promise.resolve({ cookies: [], local: [{ key: 'theme', value: 'dark' }], session: [] }),
  ),
  applySwapPlan: vi.fn(() =>
    Promise.resolve({ ok: true, value: { applied: 3, removed: 1, failed: 0 } }),
  ),
}));

import ru from '@/features/session-profiles/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { SessionProfilesPanel } from '@/features/session-profiles/ui';
import {
  sessionProfilesBinding,
  sessionProfilesSettings,
} from '@/features/session-profiles/settings';
import { createVaultStore, vaultStore } from '@/features/session-profiles/vault-store';
import { createProfile } from '@/features/session-profiles/logic';
import { applySwapPlan } from '@/features/session-profiles/swap';

mergeCatalog('ru', ru);

const mockedApply = applySwapPlan as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <SessionProfilesPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  cookiesGranted = true;
  mockedApply.mockClear();
  vaultStore.lock();
  // set (не reset) — чтобы реактивный сигнал биндинга детерминированно вернулся к
  // открытому (disabled) состоянию между тестами, не завися от времени watch-события.
  await sessionProfilesBinding.set({ profiles: [], activeByOrigin: {} });
});

describe('SessionProfilesPanel', () => {
  it('renders the panel: save-login action, help text and local-trust note', async () => {
    renderPanel();
    await settle();
    expect(screen.getByTestId('session-profiles')).toBeInTheDocument();
    // Основное действие v3 «Сохранить текущий вход как профиль» + подпись-описание.
    expect(
      screen.getByRole('button', { name: t('sessionProfiles.saveLogin') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('sessionProfiles.saveLoginHelp'))).toBeInTheDocument();
    // Переключатель защиты (сейф) + заметка local-trust под ним.
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByTestId('sp-vault-note')).toHaveTextContent(
      t('sessionProfiles.localTrustNote'),
    );
  });

  it('captures the current session and creates a profile', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('sessionProfiles.saveLogin') }));
    // Появляется инлайн-поле имени.
    await waitFor(() => {
      expect(screen.getByLabelText(t('sessionProfiles.name'))).toBeInTheDocument();
    });

    fireEvent.input(screen.getByLabelText(t('sessionProfiles.name')), {
      target: { value: 'Admin' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('sessionProfiles.create') }));

    await waitFor(() => {
      const state = sessionProfilesBinding.value.value;
      expect(state.profiles).toHaveLength(1);
      expect(state.profiles[0]?.name).toBe('Admin');
      expect(state.profiles[0]?.scope.origin).toBe('https://x.test');
    });
  });

  it('switching opens a confirm dialog, then applies the swap plan and reports', async () => {
    await sessionProfilesBinding.set({
      profiles: [
        createProfile({
          name: 'Admin',
          scope: { origin: 'https://x.test', cookieDomain: 'x.test' },
          snapshot: { cookies: [], local: [{ key: 'theme', value: 'light' }], session: [] },
          now: 1,
        }),
      ],
      activeByOrigin: {},
    });

    renderPanel();
    await settle();

    // Жмём «Переключить» на карточке Admin — инлайн-подтверждение свапа.
    fireEvent.click(screen.getByTestId('sp-switch'));
    await waitFor(() => {
      expect(screen.getByTestId('sp-swap-confirm')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('sp-swap-confirm'));

    await waitFor(() => {
      expect(mockedApply).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        screen.getByText(t('sessionProfiles.report.swapped', { applied: 3, removed: 1 })),
      ).toBeInTheDocument();
    });
  });

  it('degrades gracefully when the cookies permission is declined', async () => {
    cookiesGranted = false;
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('sessionProfiles.saveLogin') }));

    await waitFor(() => {
      expect(screen.getByTestId('sp-cookies-note')).toBeInTheDocument();
    });
    // Захват всё равно прошёл (появилось поле имени) — фича не упала.
    expect(screen.getByLabelText(t('sessionProfiles.name'))).toBeInTheDocument();
  });

  // ── сейф: at-rest-шифрование (TASK-050) ─────────────────────────────────────

  const openAdmin = (): ReturnType<typeof createProfile> =>
    createProfile({
      name: 'Admin',
      scope: { origin: 'https://x.test', cookieDomain: 'x.test' },
      snapshot: { cookies: [], local: [{ key: 'token', value: 'secret-value' }], session: [] },
      now: 1,
    });

  /** Готовит зашифрованный сейф на МАЛЫХ итерациях (быстро) и синхронизирует сигнал. */
  const seedLockedVault = async (password: string): Promise<void> => {
    await sessionProfilesBinding.set({ profiles: [openAdmin()], activeByOrigin: {} });
    const seed = createVaultStore({ iterations: 1000 });
    const res = await seed.enableEncryption(password);
    expect(res.ok).toBe(true);
    seed.lock();
    // Поднять зашифрованное состояние в сигнал биндинга и залочить синглтон UI.
    await sessionProfilesBinding.set(await sessionProfilesSettings.get());
    vaultStore.lock();
  };

  it('enabling the vault encrypts profiles at rest and switches to unlocked', async () => {
    await sessionProfilesBinding.set({ profiles: [openAdmin()], activeByOrigin: {} });
    renderPanel();
    await settle();

    // Переключатель защиты открывает форму включения сейфа.
    fireEvent.click(screen.getByRole('switch'));
    const pw = 'correct horse battery staple';
    fireEvent.input(screen.getByLabelText(t('sessionProfiles.vault.password')), {
      target: { value: pw },
    });
    fireEvent.input(screen.getByLabelText(t('sessionProfiles.vault.confirm')), {
      target: { value: pw },
    });
    // Включение необратимо (zero-recovery) — кнопка гейтится подтверждением понимания.
    fireEvent.click(screen.getByTestId('sp-vault-understand'));
    fireEvent.click(screen.getByTestId('sp-vault-enable-submit'));

    // Разблокированное состояние: появляется кнопка «Заблокировать».
    await waitFor(
      () => {
        expect(screen.getByTestId('sp-vault-lock')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    const st = await sessionProfilesSettings.get();
    expect(st.vault).toBeDefined();
    const [first] = st.profiles;
    expect(first !== undefined && 'enc' in first).toBe(true);
    expect(first !== undefined && 'snapshot' in first).toBe(false);
    vaultStore.lock();
  }, 15000);

  it('rejects a password mismatch when enabling', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.input(screen.getByLabelText(t('sessionProfiles.vault.password')), {
      target: { value: 'aaaa' },
    });
    fireEvent.input(screen.getByLabelText(t('sessionProfiles.vault.confirm')), {
      target: { value: 'bbbb' },
    });
    fireEvent.click(screen.getByTestId('sp-vault-understand'));
    fireEvent.click(screen.getByTestId('sp-vault-enable-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('sp-vault-error')).toHaveTextContent(
        t('sessionProfiles.vault.err.mismatch'),
      );
    });
    // Ничего не зашифровано — сейф не настроен.
    expect((await sessionProfilesSettings.get()).vault).toBeUndefined();
  });

  it('enable submit is gated by the zero-recovery acknowledgement', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('switch'));
    const pw = 'correct horse battery staple';
    fireEvent.input(screen.getByLabelText(t('sessionProfiles.vault.password')), {
      target: { value: pw },
    });
    fireEvent.input(screen.getByLabelText(t('sessionProfiles.vault.confirm')), {
      target: { value: pw },
    });
    // Без галочки понимания кнопка заблокирована.
    expect(screen.getByTestId('sp-vault-enable-submit')).toBeDisabled();
    fireEvent.click(screen.getByTestId('sp-vault-understand'));
    expect(screen.getByTestId('sp-vault-enable-submit')).toBeEnabled();
  });

  it('locked vault: shows unlock form + metadata, hides capture and import', async () => {
    await seedLockedVault('pw-correct');
    renderPanel();
    await settle();

    expect(screen.getByTestId('sp-unlock-form')).toBeInTheDocument();
    expect(screen.getByTestId('sp-locked-list')).toHaveTextContent('Admin');
    // Залочено: капча-захват и импорт скрыты.
    expect(screen.queryByRole('button', { name: t('sessionProfiles.saveLogin') })).toBeNull();
    expect(screen.queryByTestId('sp-import-text')).toBeNull();
  });

  it('wrong password keeps it locked; correct password reveals secrets', async () => {
    await seedLockedVault('pw-correct');
    renderPanel();
    await settle();

    fireEvent.input(screen.getByTestId('sp-unlock-input'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('sp-unlock-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('sp-unlock-error')).toHaveTextContent(
        t('sessionProfiles.vault.err.wrong-password'),
      );
    });
    expect(screen.getByTestId('sp-unlock-form')).toBeInTheDocument();

    fireEvent.input(screen.getByTestId('sp-unlock-input'), { target: { value: 'pw-correct' } });
    fireEvent.click(screen.getByTestId('sp-unlock-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('sp-current-list')).toBeInTheDocument();
    });
    // Разблокировано: доступна кнопка «Заблокировать».
    expect(screen.getByTestId('sp-vault-lock')).toBeInTheDocument();
    vaultStore.lock();
  });
});

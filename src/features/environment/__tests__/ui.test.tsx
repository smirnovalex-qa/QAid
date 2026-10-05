import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

// Платформенные швы мокаем ДО импорта UI (vi.mock поднимается в начало модуля).
vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return {
    ...actual,
    tabs: {
      ...actual.tabs,
      queryActive: () => Promise.resolve(1),
      getUrl: () => Promise.resolve('https://shop.example.com/'),
      navigate: () => Promise.resolve(),
    },
  };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return { ...actual, createPermissionBroker: () => ({ ensure: () => Promise.resolve(true) }) };
});

import { sendMessage } from '@/shared/messaging/bus';
import ru from '@/features/environment/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { EnvironmentPanel } from '@/features/environment/ui';
import { environmentBinding } from '@/features/environment/settings';
import { USER_AGENT_PRESETS } from '@/features/environment/presets';
import { EMPTY_ENVIRONMENT_CONFIG } from '@/features/environment/types';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <EnvironmentPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  mockedSend.mockReset();
  mockedSend.mockResolvedValue({ ok: true, value: {} });
  await environmentBinding.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EnvironmentPanel', () => {
  it('renders one card per channel with switches', async () => {
    renderPanel();
    await settle();
    expect(screen.getByTestId('env-channel-ua')).toBeInTheDocument();
    expect(screen.getByTestId('env-channel-geo')).toBeInTheDocument();
    expect(screen.getByTestId('env-channel-flags')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });

  it('applies the full config when a channel is switched on', async () => {
    renderPanel();
    await settle();

    const deviceSwitch = within(screen.getByTestId('env-channel-ua')).getByRole('switch');
    fireEvent.click(deviceSwitch);

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('environment/apply', {
        tabId: 1,
        config: { ...EMPTY_ENVIRONMENT_CONFIG, userAgent: USER_AGENT_PRESETS[0]?.userAgent ?? '' },
      });
    });
    // Сводка-бар появляется, когда включён хотя бы один канал.
    expect(screen.getByText(t('environment.summary', { count: 1 }))).toBeInTheDocument();
  });

  it('turns everything off and clears the emulation', async () => {
    renderPanel();
    await settle();

    fireEvent.click(within(screen.getByTestId('env-channel-ua')).getByRole('switch'));
    await waitFor(() => {
      expect(screen.getByText(t('environment.allOff'))).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: t('environment.allOff') }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('environment/clear', { tabId: 1 });
    });
  });
});

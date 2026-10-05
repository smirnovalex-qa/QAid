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
      getUrl: () => Promise.resolve('https://shop.example.com/cart'),
    },
  };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return { ...actual, createPermissionBroker: () => ({ ensure: () => Promise.resolve(true) }) };
});

import { sendMessage } from '@/shared/messaging/bus';
import ru from '@/features/forms/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { FormsPanel } from '@/features/forms/ui';
import { formsBinding } from '@/features/forms/settings';
import { violationModel } from './fixtures/forms';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <FormsPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/scan') {
      return Promise.resolve({ ok: true, value: { inspectorId: 'forms', data: violationModel() } });
    }
    if (type === 'forms/fill') return Promise.resolve({ ok: true, value: { filled: 9 } });
    if (type === 'inspection/highlight')
      return Promise.resolve({ ok: true, value: { found: true } });
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await formsBinding.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FormsPanel', () => {
  it('renders the data-type radio cards and the primary action', async () => {
    renderPanel();
    await settle();
    const group = screen.getByRole('radiogroup', { name: t('forms.dataType') });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('button', { name: t('forms.fillOnPage') })).toBeInTheDocument();
  });

  it('sends forms/fill with the selected profile and shows the result', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('forms.fillOnPage') }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('forms/fill', { tabId: 1, profile: 'valid' });
    });
    await waitFor(() => {
      expect(screen.getByText(t('forms.filled', { count: 9 }))).toBeInTheDocument();
    });
    expect(screen.getByText(t('forms.noSubmit'))).toBeInTheDocument();
  });

  it('switches the active profile when another card is chosen', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('forms.profile.injection')) }));
    fireEvent.click(screen.getByRole('button', { name: t('forms.fillOnPage') }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('forms/fill', { tabId: 1, profile: 'injection' });
    });
  });

  it('audits the page and lists issues', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('forms.check') }));

    await waitFor(() => {
      expect(screen.getByTestId('forms-issues')).toBeInTheDocument();
    });
    const rows = within(screen.getByTestId('forms-issues')).getAllByRole('button');
    // violationModel даёт 5 проблем (label-missing, type-mismatch, duplicate-id×2, required-missing).
    expect(rows).toHaveLength(5);
  });

  it('highlights a field when an issue row is clicked', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('forms.check') }));
    await waitFor(() => {
      expect(screen.getByTestId('forms-issues')).toBeInTheDocument();
    });

    const firstRow = within(screen.getByTestId('forms-issues')).getAllByRole('button')[0];
    fireEvent.click(firstRow!);

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('inspection/highlight', {
        tabId: 1,
        selector: '#a',
      });
    });
  });

  it('exports the audit report to the clipboard as CSV', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('forms.check') }));
    await waitFor(() => {
      expect(screen.getByTestId('forms-issues')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: t('forms.export.csv') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const csv = writeText.mock.calls[0]?.[0] as string;
    expect(csv).toContain('rule,selector,severity,message');
  });
});

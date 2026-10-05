/**
 * Тест инспектора контраста (редизайн v3): единое пустое состояние скана, после скана —
 * список строк со свотчем «Aa», реактивный свитч «Только проблемы», подсветка по клику и
 * экспорт CSV. Логика (`filterSamples`/`classify`/`buildReport`) не менялась — проверяем
 * её через новое представление.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return { ...actual, tabs: { ...actual.tabs, queryActive: () => Promise.resolve(1) } };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return { ...actual, createPermissionBroker: () => ({ ensure: () => Promise.resolve(true) }) };
});

import { sendMessage } from '@/shared/messaging/bus';
import ru from '@/features/inspector-contrast/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { InspectorContrastPanel } from '@/features/inspector-contrast/ui';
import { contrastBinding } from '@/features/inspector-contrast/settings';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

const scanData = {
  inspectorId: 'contrast',
  data: {
    budget: 10000,
    visited: 42,
    truncated: false,
    samples: [
      {
        selector: 'h1',
        text: 'Faint heading',
        fg: { r: 0, g: 0, b: 0, a: 1 },
        bg: { r: 255, g: 255, b: 255, a: 1 },
        ratio: 2,
        large: false,
        approximate: false,
      },
      {
        selector: 'p',
        text: 'Readable body',
        fg: { r: 0, g: 0, b: 0, a: 1 },
        bg: { r: 255, g: 255, b: 255, a: 1 },
        ratio: 21,
        large: false,
        approximate: false,
      },
      {
        selector: 'span.big',
        text: 'Large ok',
        fg: { r: 0, g: 0, b: 0, a: 1 },
        bg: { r: 255, g: 255, b: 255, a: 1 },
        ratio: 3.5,
        large: true,
        approximate: false,
      },
    ],
  },
};

function renderPanel(): void {
  render(
    <ToastProvider>
      <InspectorContrastPanel />
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
    if (type === 'inspection/scan') return Promise.resolve({ ok: true, value: scanData });
    if (type === 'inspection/highlight') {
      return Promise.resolve({ ok: true, value: { found: true } });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await contrastBinding.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InspectorContrastPanel', () => {
  it('renders the scan empty state before any scan', async () => {
    renderPanel();
    await settle();
    expect(screen.getByRole('button', { name: t('scan.scanThis') })).toBeInTheDocument();
  });

  it('scans the page and lists all samples', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));

    await waitFor(() => {
      expect(screen.getByTestId('contrast-list')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('contrast-row')).toHaveLength(3);
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('filters to problems reactively without a rescan', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
    await waitFor(() => {
      expect(screen.getByTestId('contrast-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch', { name: t('contrast.onlyFail') }));

    await waitFor(() => {
      expect(screen.getAllByTestId('contrast-row')).toHaveLength(1);
    });
    const scans = mockedSend.mock.calls.filter((c) => c[0] === 'inspection/scan');
    expect(scans).toHaveLength(1);
  });

  it('highlights a node when a row is clicked', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
    await waitFor(() => {
      expect(screen.getByTestId('contrast-list')).toBeInTheDocument();
    });

    fireEvent.click(within(screen.getByTestId('contrast-list')).getAllByTestId('contrast-row')[0]!);

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('inspection/highlight', { tabId: 1, selector: 'h1' });
    });
  });

  it('exports the report to the clipboard as CSV', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
    await waitFor(() => {
      expect(screen.getByTestId('contrast-list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: t('contrast.export.csv') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const csv = writeText.mock.calls[0]?.[0] as string;
    expect(csv).toContain('h1,Faint heading');
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });
});

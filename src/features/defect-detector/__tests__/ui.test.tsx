/**
 * Тест детектора дефектов (редизайн v3): единое пустое состояние скана, чипы тяжести
 * (Советы выключены по умолчанию), карточки-группы со строками «Показать», переключатель
 * правила в «Что проверять» (реактивно, без пересканирования) и экспорт CSV.
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
import ru from '@/features/defect-detector/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { DefectDetectorPanel } from '@/features/defect-detector/ui';
import { defectBinding } from '@/features/defect-detector/settings';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

const scanData = {
  inspectorId: 'defects',
  data: {
    budget: 10000,
    visited: 12,
    truncated: false,
    nodes: [
      {
        tag: 'img',
        attrs: { src: 'a.png' },
        role: null,
        accessibleNameHint: '',
        headingLevel: null,
        naturalWidthZero: null,
        selector: 'img.hero',
        index: 0,
      },
      {
        tag: 'button',
        attrs: {},
        role: null,
        accessibleNameHint: '',
        headingLevel: null,
        naturalWidthZero: null,
        selector: 'button#submit',
        index: 1,
      },
      {
        tag: 'a',
        attrs: { href: '#' },
        role: null,
        accessibleNameHint: 'Top',
        headingLevel: null,
        naturalWidthZero: null,
        selector: 'a.top',
        index: 2,
      },
    ],
  },
};

function renderPanel(): void {
  render(
    <ToastProvider>
      <DefectDetectorPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function scan(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
  await waitFor(() => {
    expect(screen.getByTestId('defects-groups')).toBeInTheDocument();
  });
}

beforeEach(async () => {
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/scan') return Promise.resolve({ ok: true, value: scanData });
    if (type === 'inspection/highlight') {
      return Promise.resolve({ ok: true, value: { found: true } });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await defectBinding.set({ disabledRules: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DefectDetectorPanel', () => {
  it('renders the scan empty state before any scan', async () => {
    renderPanel();
    await settle();
    expect(screen.getByRole('button', { name: t('scan.scanThis') })).toBeInTheDocument();
  });

  it('shows errors/warnings by default and reveals tips when enabled', async () => {
    renderPanel();
    await settle();
    await scan();

    // Советы (info: link-hash) по умолчанию скрыты → только 2 ошибки видны.
    expect(within(screen.getByTestId('defects-groups')).getAllByTestId('defects-row')).toHaveLength(
      2,
    );
    expect(screen.getByTestId('defects-summary')).toHaveTextContent(
      t('scan.meta.defects', { count: 3 }),
    );

    // Включаем «Советы» → появляется третья находка.
    fireEvent.click(screen.getByRole('button', { name: t('defects.filter.info') }));
    await waitFor(() => {
      expect(
        within(screen.getByTestId('defects-groups')).getAllByTestId('defects-row'),
      ).toHaveLength(3);
    });
    expect(mockedSend.mock.calls.filter((c) => c[0] === 'inspection/scan')).toHaveLength(1);
  });

  it('disables a rule reactively without a rescan', async () => {
    renderPanel();
    await settle();
    await scan();

    fireEvent.click(screen.getByRole('button', { name: t('defects.filter.info') }));
    await waitFor(() => {
      expect(
        within(screen.getByTestId('defects-groups')).getAllByTestId('defects-row'),
      ).toHaveLength(3);
    });

    // Открываем «Что проверять» и выключаем правило «Изображение без alt».
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('defects.rules')) }));
    fireEvent.click(screen.getByRole('switch', { name: t('defect.rule.imgAlt') }));

    await waitFor(() => {
      expect(
        within(screen.getByTestId('defects-groups')).getAllByTestId('defects-row'),
      ).toHaveLength(2);
    });
    expect(mockedSend.mock.calls.filter((c) => c[0] === 'inspection/scan')).toHaveLength(1);
  });

  it('highlights a node when a finding row is clicked', async () => {
    renderPanel();
    await settle();
    await scan();

    const firstRow = within(screen.getByTestId('defects-groups')).getAllByTestId('defects-row')[0];
    fireEvent.click(firstRow!);

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('inspection/highlight', {
        tabId: 1,
        selector: 'button#submit',
      });
    });
  });

  it('exports the report to the clipboard as CSV', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    await scan();

    fireEvent.click(screen.getByRole('button', { name: t('defects.export.csv') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const csv = writeText.mock.calls[0]?.[0] as string;
    expect(csv).toContain('img-alt,error,img.hero,img');
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });
});

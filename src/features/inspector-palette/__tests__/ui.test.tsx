/**
 * Тест палитры (редизайн v3): единое пустое состояние скана, сетка свотчей с мета-баром,
 * сегмент формата HEX/RGB/HSL, копирование по клику и ошибка прав. Логика
 * (`sortPalette`/`formatValue`/`paletteExport`) не менялась.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type * as Platform from '@/platform';
import { mergeCatalog, t } from '@/i18n';
import { ToastProvider } from '@/ui/components';
import ru from '@/features/inspector-palette/i18n/ru';
import { aggregatePalette } from '@/shared/inspection/palette/logic';
import { RED } from '@/shared/inspection/palette/__tests__/fixtures/colors';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  ensure: vi.fn(),
  queryActive: vi.fn(),
}));

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: mocks.sendMessage }));
vi.mock('@/shared/permissions', () => ({
  createPermissionBroker: () => ({ ensure: mocks.ensure, has: vi.fn() }),
}));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof Platform>();
  return { ...actual, tabs: { queryActive: mocks.queryActive } };
});

import { InspectorPalettePanel } from '@/features/inspector-palette/ui';
import { paletteBinding } from '@/features/inspector-palette/settings';

mergeCatalog('ru', ru);

const SCAN_DATA = {
  entries: aggregatePalette([
    { rgba: RED, selector: 'button.primary', property: 'background-color' },
  ]),
  elements: 7,
};

function renderPanel(): void {
  render(
    <ToastProvider>
      <InspectorPalettePanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  mocks.ensure.mockReset().mockResolvedValue(true);
  mocks.queryActive.mockReset().mockResolvedValue(1);
  mocks.sendMessage.mockReset().mockImplementation((type: string) => {
    if (type === 'inspection/scan') {
      return Promise.resolve({ ok: true, value: { inspectorId: 'palette', data: SCAN_DATA } });
    }
    return Promise.resolve({ ok: true, value: null });
  });
  await paletteBinding.set({ format: 'hex', sort: 'frequency' });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('InspectorPalettePanel', () => {
  it('scans the page and shows swatches', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));

    const swatch = await screen.findByTestId('palette-swatch');
    expect(swatch).toHaveTextContent('#ff0000');
    expect(mocks.sendMessage).toHaveBeenCalledWith('inspection/scan', {
      tabId: 1,
      inspectorId: 'palette',
    });
  });

  it('switching format changes the shown value', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
    await screen.findByTestId('palette-swatch');

    fireEvent.click(screen.getByRole('radio', { name: 'RGB' }));

    await waitFor(() => {
      expect(screen.getByTestId('palette-swatch')).toHaveTextContent('rgb(255, 0, 0)');
    });
  });

  it('copies the value and shows a toast when a swatch is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
    const swatch = await screen.findByTestId('palette-swatch');

    fireEvent.click(swatch);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('#ff0000');
    });
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });

  it('surfaces a permission error', async () => {
    mocks.ensure.mockResolvedValue(false);
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));

    expect(await screen.findByTestId('palette-error')).toHaveTextContent(
      t('palette.error.permissionDenied'),
    );
  });
});

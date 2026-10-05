/**
 * Тест инспектора шрифтов (редизайн v3): единое пустое состояние скана, карточки
 * семейств с бейджем источника, экспорт в буфер и осмотр одного элемента с профилем и
 * превью. Логика (`aggregateUsages`/`formatReport`) не менялась.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import { ToastProvider } from '@/ui/components';
import type { FontsScanData } from '@/shared/inspection/fonts/types';
import ru from '../i18n/ru';

const h = vi.hoisted(() => ({
  ensure: vi.fn<() => Promise<boolean>>(),
  queryActive: vi.fn<() => Promise<number | undefined>>(),
  send: vi.fn(),
}));

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: h.send }));
vi.mock('@/shared/permissions', () => ({
  createPermissionBroker: () => ({ ensure: h.ensure }),
}));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, tabs: { queryActive: h.queryActive } };
});

const { InspectorFontsPanel } = await import('../ui');

mergeCatalog('ru', ru);

const SCAN_DATA: FontsScanData = {
  samples: [
    {
      selector: 'h1#title',
      family: 'Inter',
      fallbackChain: ['Inter', 'sans-serif'],
      fontSize: '32px',
      fontWeight: '700',
      fontStyle: 'normal',
      lineHeight: '40px',
      letterSpacing: 'normal',
      text: 'Heading',
    },
  ],
  loadedFamilies: ['inter'],
  faces: [],
  fontsApiAvailable: true,
};

function renderPanel(): void {
  render(
    <ToastProvider>
      <InspectorFontsPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  h.ensure.mockReset().mockResolvedValue(true);
  h.queryActive.mockReset().mockResolvedValue(1);
  h.send.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InspectorFontsPanel', () => {
  it('scans the page and shows a family card with its source badge', async () => {
    h.send.mockResolvedValue({ ok: true, value: { inspectorId: 'fonts', data: SCAN_DATA } });

    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));

    await waitFor(() => {
      expect(screen.getByText('Inter')).toBeInTheDocument();
    });
    expect(screen.getByText(t('fonts.badge.web'))).toBeInTheDocument();
    expect(screen.getByText(t('fonts.count', { count: 1 }))).toBeInTheDocument();
  });

  it('exports the report to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    h.send.mockResolvedValue({ ok: true, value: { inspectorId: 'fonts', data: SCAN_DATA } });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));
    await waitFor(() => {
      expect(screen.getByText('Inter')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: t('fonts.export.csv') }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('Inter');
  });

  it('inspecting an element shows the profile with a preview', async () => {
    h.send.mockImplementation((type: string) => {
      if (type === 'inspection/pick') {
        return Promise.resolve({
          ok: true,
          value: {
            tagName: 'h1',
            id: 'title',
            classNames: [],
            selector: 'h1#title',
            rect: { x: 0, y: 0, width: 10, height: 10 },
          },
        });
      }
      return Promise.resolve({ ok: true, value: { inspectorId: 'fonts', data: SCAN_DATA } });
    });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('fonts.inspect') }));

    await waitFor(() => {
      expect(screen.getByTestId('fonts-profile')).toBeInTheDocument();
    });
    expect(screen.getByText(t('fonts.previewText'))).toBeInTheDocument();
  });

  it('surfaces a permission error', async () => {
    h.ensure.mockResolvedValue(false);

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('scan.scanThis') }));

    await waitFor(() => {
      expect(screen.getByTestId('fonts-error')).toHaveTextContent(
        t('fonts.error.permissionDenied'),
      );
    });
  });
});

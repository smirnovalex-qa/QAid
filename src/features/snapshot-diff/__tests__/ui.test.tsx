/**
 * Тест сравнения состояний (редизайн v3): две плитки-шага, чипы-фильтры категорий,
 * строки дифа со значками (+ − ~), подсветка по клику и экспорт Markdown. Логика
 * (`diffSnapshots`/`buildDiffReport`) не менялась.
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
import ru from '@/features/snapshot-diff/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { SnapshotDiffPanel } from '@/features/snapshot-diff/ui';
import { snapshotDiffBinding } from '@/features/snapshot-diff/settings';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function n(key: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key,
    path: `path=${key}`,
    tag: 'div',
    selector: key,
    attrs: {},
    styles: {},
    text: '',
    ...over,
  };
}

const SNAP_A = {
  inspectorId: 'snapshot',
  data: {
    budget: 10000,
    visited: 2,
    truncated: false,
    nodes: [
      n('testid=title', { tag: 'h1', selector: 'h1.title', text: 'Before' }),
      n('testid=gone'),
    ],
  },
};

const SNAP_B = {
  inspectorId: 'snapshot',
  data: {
    budget: 10000,
    visited: 2,
    truncated: false,
    nodes: [
      n('testid=title', { tag: 'h1', selector: 'h1.title', text: 'After' }),
      n('testid=added', { tag: 'span', selector: 'span.added' }),
    ],
  },
};

function renderPanel(): void {
  render(
    <ToastProvider>
      <SnapshotDiffPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function captureBoth(): Promise<void> {
  fireEvent.click(screen.getByTestId('snapshot-step-a'));
  await waitFor(() => {
    expect(screen.getByTestId('snapshot-step-a')).toHaveTextContent('✓');
  });
  fireEvent.click(screen.getByTestId('snapshot-step-b'));
  await waitFor(() => {
    expect(screen.getByTestId('snapshot-summary')).toBeInTheDocument();
  });
}

beforeEach(async () => {
  mockedSend.mockReset();
  let scanCount = 0;
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/scan') {
      scanCount += 1;
      return Promise.resolve({ ok: true, value: scanCount === 1 ? SNAP_A : SNAP_B });
    }
    if (type === 'inspection/highlight')
      return Promise.resolve({ ok: true, value: { found: true } });
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await snapshotDiffBinding.set({ filter: 'all' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SnapshotDiffPanel', () => {
  it('renders two step tiles and prompts for both before a diff', async () => {
    renderPanel();
    await settle();
    expect(screen.getByTestId('snapshot-step-a')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-step-b')).toBeInTheDocument();
  });

  it('captures A then B and shows the diff rows', async () => {
    renderPanel();
    await settle();
    await captureBoth();

    expect(screen.getByTestId('snapshot-summary')).toHaveTextContent(
      t('snapshotDiff.summary', { added: 1, removed: 1, changed: 1 }),
    );
    const rows = screen.getByTestId('snapshot-diff-rows');
    expect(within(rows).getByText('span.added')).toBeInTheDocument();
    expect(within(rows).getByText('h1.title')).toBeInTheDocument();
  });

  it('filters out text changes via the chip without recapturing', async () => {
    renderPanel();
    await settle();
    await captureBoth();

    const scansBefore = mockedSend.mock.calls.filter((c) => c[0] === 'inspection/scan').length;
    fireEvent.click(screen.getByRole('button', { name: t('snapshotDiff.filter.text') }));

    await waitFor(() => {
      const rows = screen.getByTestId('snapshot-diff-rows');
      expect(within(rows).queryByText('h1.title')).not.toBeInTheDocument();
      expect(within(rows).getByText('span.added')).toBeInTheDocument();
    });
    const scansAfter = mockedSend.mock.calls.filter((c) => c[0] === 'inspection/scan').length;
    expect(scansAfter).toBe(scansBefore);
  });

  it('highlights a node when a diff row is clicked', async () => {
    renderPanel();
    await settle();
    await captureBoth();

    fireEvent.click(within(screen.getByTestId('snapshot-diff-rows')).getByText('span.added'));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('inspection/highlight', {
        tabId: 1,
        selector: 'span.added',
      });
    });
  });

  it('exports the diff as Markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    await captureBoth();

    fireEvent.click(screen.getByRole('button', { name: t('snapshotDiff.export.markdown') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]?.[0] as string).toContain('# Snapshot diff');
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import ru from '@/features/random-numbers/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { RandomNumbersPanel } from '@/features/random-numbers/ui';

// Панель импортируется напрямую (без index) — домешиваем её каталог вручную.
mergeCatalog('ru', ru);

function renderPanel(): void {
  render(
    <ToastProvider>
      <RandomNumbersPanel />
    </ToastProvider>,
  );
}

/** Даём асинхронной загрузке настроек и seed-эффекту осесть до взаимодействия. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function setInput(label: string, value: string): void {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RandomNumbersPanel', () => {
  it('generates the requested count of integers within range', async () => {
    renderPanel();
    await settle();
    setInput(t('rn.min'), '0');
    setInput(t('rn.max'), '9');
    setInput(t('rn.count'), '5');

    fireEvent.click(screen.getByRole('button', { name: t('rn.generate') }));

    const out = screen.getByTestId<HTMLTextAreaElement>('rn-output');
    const parts = out.value.split(', ');
    expect(parts).toHaveLength(5);
    for (const p of parts) {
      const n = Number(p);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it('disables Generate and shows an error when min > max', async () => {
    renderPanel();
    await settle();
    setInput(t('rn.min'), '100');
    setInput(t('rn.max'), '0');

    const gen = screen.getByRole('button', { name: t('rn.generate') });
    expect(gen).toBeDisabled();
    expect(screen.getAllByText(t('rn.err.min_gt_max')).length).toBeGreaterThan(0);

    setInput(t('rn.min'), '0');
    expect(gen).toBeEnabled();
  });

  it('copies the output and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    setInput(t('rn.min'), '1');
    setInput(t('rn.max'), '1');
    setInput(t('rn.count'), '3');

    fireEvent.click(screen.getByRole('button', { name: t('rn.generate') }));
    fireEvent.click(screen.getByRole('button', { name: t('rn.copy') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('1, 1, 1');
    });
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });

  it('clamps count above 100000 and shows a toast', async () => {
    renderPanel();
    await settle();
    setInput(t('rn.count'), '250000');
    expect(screen.getByLabelText(t('rn.count'))).toHaveValue(100000);
    expect(await screen.findByText(t('rn.warn.count_clamped'))).toBeInTheDocument();
  });

  it('shows the decimals field only in float mode', async () => {
    renderPanel();
    await settle();
    expect(screen.queryByLabelText(t('rn.precision'))).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: t('rn.float') }));
    expect(screen.getByLabelText(t('rn.precision'))).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import ru from '@/features/random-strings/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { RandomStringsPanel } from '@/features/random-strings/ui';

// Панель импортируется напрямую (без index) — домешиваем каталог вручную.
mergeCatalog('ru', ru);

function renderPanel(): void {
  render(
    <ToastProvider>
      <RandomStringsPanel />
    </ToastProvider>,
  );
}

/** Даём асинхронной загрузке настроек и seed-эффекту осесть. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function generate(): void {
  fireEvent.click(screen.getByRole('button', { name: t('rs.generate') }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RandomStringsPanel', () => {
  it('disables Generate and warns when the alphabet is empty', async () => {
    renderPanel();
    await settle();

    // Выключаем включённые по умолчанию наборы (латиница строчн./заглавн., цифры).
    for (const key of ['rs.latinLower', 'rs.latinUpper', 'rs.digits']) {
      fireEvent.click(screen.getByRole('button', { name: t(key) }));
    }

    expect(screen.getByRole('button', { name: t('rs.generate') })).toBeDisabled();
    expect(screen.getByText(t('rs.err.empty_alphabet'))).toBeInTheDocument();
  });

  it('generates the requested count of strings within the length range', async () => {
    renderPanel();
    await settle();

    fireEvent.input(screen.getByLabelText(t('rs.lengthFrom')), { target: { value: '6' } });
    fireEvent.input(screen.getByLabelText(t('rs.lengthTo')), { target: { value: '10' } });
    fireEvent.input(screen.getByLabelText(t('rs.count')), { target: { value: '8' } });
    generate();

    const out = screen.getByTestId<HTMLTextAreaElement>('rs-output');
    const lines = out.value.split('\n');
    expect(lines).toHaveLength(8);
    for (const line of lines) {
      expect(Array.from(line).length).toBeGreaterThanOrEqual(6);
      expect(Array.from(line).length).toBeLessThanOrEqual(10);
    }
  });

  it('copies the output and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    generate();

    const expected = screen.getByTestId<HTMLTextAreaElement>('rs-output').value;
    fireEvent.click(screen.getByRole('button', { name: t('rs.copy') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expected);
    });
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });

  it('copies a CSV export with a header row', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    // Явно задаём количество — биндинг настроек общий между тестами.
    fireEvent.input(screen.getByLabelText(t('rs.count')), { target: { value: '5' } });
    generate();

    fireEvent.click(screen.getByRole('radio', { name: t('rs.export.csv') }));
    fireEvent.click(screen.getByRole('button', { name: t('rs.copy') }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const payload = writeText.mock.calls[0]?.[0] as string;
    expect(payload.startsWith('value\r\n')).toBe(true);
    expect(payload.split('\r\n')).toHaveLength(6); // header + 5 строк
  });

  it('shows the length-order error and marks the fields invalid', async () => {
    renderPanel();
    await settle();
    fireEvent.input(screen.getByLabelText(t('rs.lengthFrom')), { target: { value: '9' } });
    fireEvent.input(screen.getByLabelText(t('rs.lengthTo')), { target: { value: '3' } });

    expect(screen.getByText(t('rs.err.length_order'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('rs.lengthFrom'))).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: t('rs.generate') })).toBeDisabled();
  });

  it('summarises active extras in the More options row', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('rs.more')) }));
    fireEvent.input(screen.getByLabelText(t('rs.prefix')), { target: { value: 'u_' } });
    expect(screen.getByText(t('rs.extra.affix'))).toBeInTheDocument();
  });
});

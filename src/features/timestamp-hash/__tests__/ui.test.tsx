import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import ru from '@/features/timestamp-hash/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { isUuidV4 } from '@/features/timestamp-hash/logic';
import { TimestampHashPanel } from '@/features/timestamp-hash/ui';

// Панель импортируется напрямую (без index) — домешиваем её каталог вручную.
mergeCatalog('ru', ru);

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function renderPanel(): void {
  render(
    <ToastProvider>
      <TimestampHashPanel />
    </ToastProvider>,
  );
}

/** Даём асинхронной загрузке настроек осесть до взаимодействия. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function openTab(key: 'hash' | 'uuid'): void {
  fireEvent.click(screen.getByRole('tab', { name: t(`tsh.tab.${key}`) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TimestampHashPanel', () => {
  it('starts on the Time tab and reads a unix-seconds value', async () => {
    renderPanel();
    await settle();

    expect(screen.getByRole('tab', { name: t('tsh.tab.time') })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.input(screen.getByTestId('tsh-time-input'), { target: { value: '0' } });
    expect(screen.getByTestId('tsh-detected')).toHaveTextContent(t('tsh.detect.s'));
    expect(screen.getByTestId('tsh-time-rows')).toHaveTextContent('1970-01-01T00:00:00.000Z');
  });

  it('flags an unreadable value with role=alert and aria-invalid', async () => {
    renderPanel();
    await settle();

    const input = screen.getByTestId('tsh-time-input');
    fireEvent.input(input, { target: { value: 'not a date' } });
    expect(screen.getByTestId('tsh-detected')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('tsh-detected')).toHaveTextContent(t('tsh.detect.err'));
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('Now fills the input with current unix seconds', async () => {
    renderPanel();
    await settle();

    const input = screen.getByTestId<HTMLInputElement>('tsh-time-input');
    fireEvent.input(input, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: t('tsh.now') }));
    expect(Number(input.value)).toBeGreaterThan(1_000_000_000);
  });

  it('computes the difference between two dates', async () => {
    renderPanel();
    await settle();

    fireEvent.input(screen.getByLabelText(t('tsh.diff.from')), {
      target: { value: '2026-10-01T09:00:00Z' },
    });
    fireEvent.input(screen.getByLabelText(t('tsh.diff.to')), {
      target: { value: '2026-10-03T14:32:10Z' },
    });
    expect(screen.getByTestId('tsh-diff-result')).toHaveTextContent(
      `2${t('tsh.unit.d')} 5${t('tsh.unit.h')} 32${t('tsh.unit.m')} 10${t('tsh.unit.s')}`,
    );
  });

  it('generates a valid v4 UUID list', async () => {
    renderPanel();
    await settle();
    openTab('uuid');

    fireEvent.input(screen.getByLabelText(t('tsh.uuid.count')), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: t('tsh.uuid.generate') }));

    const lines = (screen.getByTestId('tsh-uuid-output').textContent ?? '').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => isUuidV4(l))).toBe(true);
  });

  it('hashes "abc" with SHA-256 to the known digest', async () => {
    renderPanel();
    await settle();
    openTab('hash');

    fireEvent.input(screen.getByLabelText(t('tsh.hash.input')), { target: { value: 'abc' } });

    await waitFor(() => {
      expect(screen.getByTestId('tsh-hash-hex')).toHaveTextContent(SHA256_ABC);
    });
  });

  it('shows the MD5 warning only for MD5', async () => {
    renderPanel();
    await settle();
    openTab('hash');

    expect(screen.queryByText(t('tsh.md5.warn'))).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'MD5' }));
    expect(screen.getByText(t('tsh.md5.warn'))).toBeInTheDocument();
  });

  it('copies the hash row and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    openTab('hash');
    // Алгоритм персистится в общем биндинге — явно выбираем SHA-256.
    fireEvent.click(screen.getByRole('radio', { name: 'SHA-256' }));

    fireEvent.input(screen.getByLabelText(t('tsh.hash.input')), { target: { value: 'abc' } });
    await waitFor(() => {
      expect(screen.getByTestId('tsh-hash-hex')).toHaveTextContent(SHA256_ABC);
    });

    fireEvent.click(screen.getByTestId('tsh-hash-hex'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(SHA256_ABC);
    });
    expect(await screen.findByText(t('toast.copied'))).toBeInTheDocument();
  });
});

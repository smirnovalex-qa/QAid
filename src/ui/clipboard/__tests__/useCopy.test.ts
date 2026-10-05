import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import type { JSX } from 'preact';
import { ToastProvider } from '@/ui/components';
import { t } from '@/i18n';
import { useCopy } from '@/ui/clipboard/useCopy';
import type { UseCopyOptions } from '@/ui/clipboard/useCopy';

// Обвязка на h() (файл .ts — без JSX): статус наружу + кнопка запуска копии.
function Harness(props: { opts?: UseCopyOptions; text: string }): JSX.Element {
  const { copy, status } = useCopy(props.opts);
  return h('div', null, [
    h('span', { 'data-testid': 'status', key: 's' }, status.value),
    h(
      'button',
      {
        key: 'b',
        type: 'button',
        onClick: () => {
          void copy(props.text);
        },
      },
      'copy',
    ),
  ]);
}

function renderHarness(text: string, opts?: UseCopyOptions): void {
  const child = opts ? h(Harness, { text, opts }) : h(Harness, { text });
  render(h(ToastProvider, null, child));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useCopy', () => {
  it('успех: статус copied, тост success, авто-сброс в idle', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers();

    renderHarness('hello', { resetMs: 1000 });
    await act(async () => {
      screen.getByText('copy').click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('hello');
    expect(screen.getByTestId('status')).toHaveTextContent('copied');
    expect(screen.getByRole('status')).toHaveTextContent(t('toast.copied'));

    await act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('ошибка: статус error, danger-тост', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    // execCommand в jsdom отсутствует → legacyCopy бросает → copyText вернёт false.

    renderHarness('x');
    await act(async () => {
      screen.getByText('copy').click();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error');
    });
    expect(screen.getByRole('alert')).toHaveTextContent(t('copy.error'));
  });

  it('toast:false подавляет тост, но статус выставляется', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderHarness('y', { toast: false });
    await act(async () => {
      screen.getByText('copy').click();
      await Promise.resolve();
    });

    expect(screen.getByTestId('status')).toHaveTextContent('copied');
    expect(screen.queryByText(t('toast.copied'))).not.toBeInTheDocument();
  });

  it('копирование пустой строки допустимо', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderHarness('');
    await act(async () => {
      screen.getByText('copy').click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('');
    expect(screen.getByTestId('status')).toHaveTextContent('copied');
  });
});

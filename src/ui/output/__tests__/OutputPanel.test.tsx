import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/preact';
import { ToastProvider } from '@/ui/components';
import { t } from '@/i18n';
import { OutputPanel } from '@/ui/output/OutputPanel';
import type { OutputPanelProps } from '@/ui/output/OutputPanel';

function renderPanel(props: OutputPanelProps): void {
  render(
    <ToastProvider>
      <OutputPanel {...props} />
    </ToastProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OutputPanel', () => {
  it('рендерит значение в readonly-области', () => {
    renderPanel({ value: '1, 2, 3', 'data-testid': 'out' });
    const area = screen.getByTestId<HTMLTextAreaElement>('out');
    expect(area.value).toBe('1, 2, 3');
    expect(area).toHaveAttribute('readonly');
  });

  it('показывает подсказку при пустом значении', () => {
    renderPanel({ value: '' });
    expect(screen.getByText(t('output.empty'))).toBeInTheDocument();
  });

  it('использует кастомную подсказку пустоты', () => {
    renderPanel({ value: '', emptyHint: 'Ничего нет' });
    expect(screen.getByText('Ничего нет')).toBeInTheDocument();
  });

  it('показывает счётчик, когда передан', () => {
    renderPanel({ value: 'x', count: 42, 'data-testid': 'out' });
    expect(screen.getByTestId('out-count')).toHaveTextContent('42');
  });

  it('кнопка копирования копирует value через useCopy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel({ value: 'copy-me' });
    await act(async () => {
      screen.getByRole('button', { name: t('action.copy') }).click();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('copy-me');
    });
  });

  it('onCopy переопределяет встроенное копирование', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const onCopy = vi.fn();

    renderPanel({ value: 'v', onCopy });
    screen.getByRole('button', { name: t('action.copy') }).click();

    expect(onCopy).toHaveBeenCalledOnce();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copyable:false скрывает кнопку копирования', () => {
    renderPanel({ value: 'v', copyable: false });
    expect(screen.queryByRole('button', { name: t('action.copy') })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import type { JSX } from 'preact';
import { ToastProvider, useToast } from '../ToastProvider';
import type { ToastOptions } from '../ToastProvider';

// Тестовая обвязка: кнопка, вызывающая show с заданными опциями.
function Trigger(props: { message: string; opts?: ToastOptions }): JSX.Element {
  const { show } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        show(props.message, props.opts);
      }}
    >
      show
    </button>
  );
}

describe('Toast', () => {
  it('показывает сообщение в живом регионе role=status aria-live=polite', () => {
    render(
      <ToastProvider>
        <Trigger message="Скопировано" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('show'));

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent('Скопировано');
  });

  it('авто-скрывается после длительности', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <Trigger message="Скопировано" opts={{ durationMs: 2500 }} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByText('show'));
      expect(screen.getByText('Скопировано')).toBeInTheDocument();

      void act(() => {
        vi.advanceTimersByTime(2600);
      });

      expect(screen.queryByText('Скопировано')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('тост danger рендерится в регионе aria-live=assertive', () => {
    render(
      <ToastProvider>
        <Trigger message="Ошибка" opts={{ severity: 'danger' }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('show'));

    const region = screen.getByRole('alert');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveTextContent('Ошибка');
  });

  it('useToast вне провайдера бросает ошибку', () => {
    function Orphan(): null {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });
});

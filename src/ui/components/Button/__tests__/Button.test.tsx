import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
// подключаем типы jest-dom матчеров в TS-программу (рантайм — из vitest.setup)
import { Button } from '../Button';

describe('Button', () => {
  it('рендерит текст детей', () => {
    render(<Button>Сохранить</Button>);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('loading выставляет aria-busy и блокирует кнопку', () => {
    render(<Button loading>Отправить</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
  });

  it('применяет вариант и сохраняет доступное имя', () => {
    render(<Button variant="danger">Удалить</Button>);
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });

  it('onClick срабатывает, когда кнопка активна', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Клик</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('onClick не срабатывает, когда кнопка disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Клик
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

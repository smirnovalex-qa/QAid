/**
 * Тесты обёртки ленивого тела фичи (F1 TASK-046, ADR-0047): загрузочное состояние,
 * проксирование `subtab`, мягкая деградация при сбое динамического импорта + повтор.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { LazyPanel } from '../LazyPanel';

describe('LazyPanel', () => {
  it('показывает загрузку, затем рендерит резолвленное тело', async () => {
    const Body = () => <div>loaded-body</div>;
    render(<LazyPanel featureId="lp-load" load={() => Promise.resolve(Body)} />);

    // Пока тело грузится — виден статус загрузки (без сдвига layout).
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('loaded-body')).toBeInTheDocument();
  });

  it('проксирует subtab в тело фичи', async () => {
    const Body = ({ subtab }: { subtab?: string | undefined }) => <div>sub:{subtab}</div>;
    render(<LazyPanel featureId="lp-sub" load={() => Promise.resolve(Body)} subtab="jwt" />);

    expect(await screen.findByText('sub:jwt')).toBeInTheDocument();
  });

  it('мягко деградирует при сбое импорта и повторяет по кнопке', async () => {
    const Body = () => <div>ok-after-retry</div>;
    let attempts = 0;
    const load = vi.fn(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('chunk load failed'))
        : Promise.resolve(Body);
    });

    render(<LazyPanel featureId="lp-retry" load={load} />);

    // Сбой → сообщение об ошибке (role=alert), а не белый экран.
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('ok-after-retry')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

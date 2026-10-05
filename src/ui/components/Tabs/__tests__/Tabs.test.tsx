import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Tabs } from '../Tabs';
import type { TabItem } from '../Tabs';

const noop = (): void => {
  /* заглушка onChange */
};

const tabs: TabItem[] = [
  { id: 'a', label: 'Первая' },
  { id: 'b', label: 'Вторая' },
  { id: 'c', label: 'Третья' },
];

describe('Tabs', () => {
  it('рендерит по вкладке на каждый элемент с role=tab', () => {
    render(<Tabs tabs={tabs} activeId="a" onChange={noop} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('помечает активную вкладку aria-selected=true, остальные false', () => {
    render(<Tabs tabs={tabs} activeId="b" onChange={noop} />);
    const [first, second, third] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(third).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowRight переключает на следующую вкладку', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />);
    const active = screen.getByRole('tab', { selected: true });
    fireEvent.keyDown(active, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('ArrowRight заворачивает с последней на первую', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} activeId="c" onChange={onChange} />);
    const active = screen.getByRole('tab', { selected: true });
    fireEvent.keyDown(active, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('панель имеет role=tabpanel и aria-labelledby активной вкладки', () => {
    render(<Tabs tabs={tabs} activeId="b" onChange={noop} />);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-b');
    expect(panel).toHaveAttribute('id', 'panel-b');
  });
});

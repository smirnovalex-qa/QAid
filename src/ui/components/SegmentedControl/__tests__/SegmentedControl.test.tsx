import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { SegmentedControl } from '../SegmentedControl';
import type { SegmentOption } from '../SegmentedControl';

const noop = (): void => {
  /* заглушка onChange */
};

const options: SegmentOption[] = [
  { value: 'decode', label: 'Decode' },
  { value: 'encode', label: 'Encode' },
  { value: 'raw', label: 'Raw' },
];

describe('SegmentedControl', () => {
  it('рендерит radiogroup c радио по опции', () => {
    render(<SegmentedControl options={options} value="decode" onChange={noop} label="Режим" />);
    expect(screen.getByRole('radiogroup', { name: 'Режим' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('помечает активный сегмент aria-checked=true, roving tabindex', () => {
    render(<SegmentedControl options={options} value="encode" onChange={noop} label="Режим" />);
    const [first, second] = screen.getAllByRole('radio');
    expect(first).toHaveAttribute('aria-checked', 'false');
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(second).toHaveAttribute('aria-checked', 'true');
    expect(second).toHaveAttribute('tabindex', '0');
  });

  it('клик по сегменту вызывает onChange с его значением', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="decode" onChange={onChange} label="Режим" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Encode' }));
    expect(onChange).toHaveBeenCalledWith('encode');
  });

  it('ArrowRight переключает на следующий сегмент', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="decode" onChange={onChange} label="Режим" />);
    fireEvent.keyDown(screen.getByRole('radio', { checked: true }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('encode');
  });

  it('ArrowLeft заворачивает с первого на последний', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="decode" onChange={onChange} label="Режим" />);
    fireEvent.keyDown(screen.getByRole('radio', { checked: true }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('raw');
  });
});

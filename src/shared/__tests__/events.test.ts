import { describe, expect, it, vi } from 'vitest';
import { emit, on } from '@/shared/events';

// Тестовое событие через declaration merging — так же, как это делают фичи.
declare module '@/shared/events' {
  interface AppEvents {
    'test:tick': { n: number };
  }
}

describe('events', () => {
  it('delivers payload from emit to on', () => {
    const cb = vi.fn();
    on('test:tick', cb);
    emit('test:tick', { n: 1 });
    expect(cb).toHaveBeenCalledWith({ n: 1 });
  });

  it('delivers to multiple listeners', () => {
    const a = vi.fn();
    const b = vi.fn();
    on('test:tick', a);
    on('test:tick', b);
    emit('test:tick', { n: 2 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops delivery', () => {
    const cb = vi.fn();
    const off = on('test:tick', cb);
    off();
    emit('test:tick', { n: 3 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('emit with no listeners is a no-op', () => {
    expect(() => {
      emit('test:tick', { n: 4 });
    }).not.toThrow();
  });
});

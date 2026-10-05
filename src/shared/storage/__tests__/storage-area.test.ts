import { describe, it, expect, vi } from 'vitest';

import { createMemoryArea, type StorageChange } from '../storage-area';

describe('createMemoryArea', () => {
  it('round-trips значение: setRaw затем getRaw', async () => {
    const area = createMemoryArea();
    await area.setRaw('a', 42);
    expect(await area.getRaw('a')).toBe(42);
  });

  it('getRaw отсутствующего ключа возвращает undefined', async () => {
    const area = createMemoryArea();
    expect(await area.getRaw('missing')).toBeUndefined();
  });

  it('getManyRaw возвращает только присутствующие ключи', async () => {
    const area = createMemoryArea();
    await area.setRaw('a', 1);
    await area.setRaw('b', 2);
    const result = await area.getManyRaw(['a', 'b', 'c']);
    expect(result).toEqual({ a: 1, b: 2 });
    expect('c' in result).toBe(false);
  });

  it('уважает seed (клонируя его)', async () => {
    const seed = { x: 'hello' };
    const area = createMemoryArea(seed);
    expect(await area.getRaw('x')).toBe('hello');
    // Мутация исходного seed не протекает в хранилище.
    seed.x = 'changed';
    expect(await area.getRaw('x')).toBe('hello');
  });

  it('removeRaw удаляет ключ', async () => {
    const area = createMemoryArea({ a: 1 });
    await area.removeRaw('a');
    expect(await area.getRaw('a')).toBeUndefined();
  });

  it('clearAll очищает хранилище', async () => {
    const area = createMemoryArea({ a: 1, b: 2 });
    await area.clearAll();
    expect(await area.getManyRaw(['a', 'b'])).toEqual({});
  });

  it('onChanged срабатывает с ключом и newValue на setRaw', async () => {
    const area = createMemoryArea();
    const listener = vi.fn<(changes: Record<string, StorageChange>) => void>();
    area.onChanged(listener);
    await area.setRaw('a', 7);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ a: { newValue: 7 } });
  });

  it('onChanged включает oldValue при перезаписи существующего ключа', async () => {
    const area = createMemoryArea({ a: 1 });
    const listener = vi.fn<(changes: Record<string, StorageChange>) => void>();
    area.onChanged(listener);
    await area.setRaw('a', 2);
    expect(listener).toHaveBeenCalledWith({ a: { oldValue: 1, newValue: 2 } });
  });

  it('onChanged срабатывает с oldValue на removeRaw', async () => {
    const area = createMemoryArea({ a: 5 });
    const listener = vi.fn<(changes: Record<string, StorageChange>) => void>();
    area.onChanged(listener);
    await area.removeRaw('a');
    expect(listener).toHaveBeenCalledWith({ a: { oldValue: 5 } });
  });

  it('изменение одного ключа не включает несвязанный ключ', async () => {
    const area = createMemoryArea({ b: 'other' });
    const listener = vi.fn<(changes: Record<string, StorageChange>) => void>();
    area.onChanged(listener);
    await area.setRaw('a', 1);
    const changes = listener.mock.calls[0]![0];
    expect('a' in changes).toBe(true);
    expect('b' in changes).toBe(false);
  });

  it('unsubscribe останавливает дальнейшие уведомления', async () => {
    const area = createMemoryArea();
    const listener = vi.fn<(changes: Record<string, StorageChange>) => void>();
    const unsubscribe = area.onChanged(listener);
    await area.setRaw('a', 1);
    unsubscribe();
    await area.setRaw('a', 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe удаляет только свой listener', async () => {
    const area = createMemoryArea();
    const listenerA = vi.fn<(changes: Record<string, StorageChange>) => void>();
    const listenerB = vi.fn<(changes: Record<string, StorageChange>) => void>();
    const unsubscribeA = area.onChanged(listenerA);
    area.onChanged(listenerB);
    unsubscribeA();
    await area.setRaw('a', 1);
    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledTimes(1);
  });
});

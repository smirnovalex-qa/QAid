import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/preact';
import { z } from 'zod';
import { defineFeatureSettings } from '@/shared/storage/settings';
import type { FeatureSettings } from '@/shared/storage/settings';
import { createMemoryArea } from '@/shared/storage/storage-area';
import { createSettingsBinding, useSettings } from '@/shared/storage/preact/useSettings';
import type { SettingsBinding } from '@/shared/storage/preact/useSettings';

const schema = z.object({ count: z.number().default(0) });
type Counter = z.infer<typeof schema>;

function View({ binding, tid }: { binding: SettingsBinding<Counter>; tid: string }) {
  const b = useSettings(binding);
  return <span data-testid={tid}>{b.ready.value ? String(b.value.value.count) : 'loading'}</span>;
}

describe('useSettings binding', () => {
  it('shares one signal across components and updates both reactively', async () => {
    const fs = defineFeatureSettings<Counter>(
      { namespace: 'rn', schema, defaults: { count: 0 } },
      createMemoryArea(),
    );
    await fs.set({ count: 1 });
    const binding = createSettingsBinding(fs);

    render(
      <div>
        <View binding={binding} tid="a" />
        <View binding={binding} tid="b" />
      </div>,
    );

    // После монтирования биндинг загружает значение из хранилища.
    await waitFor(() => {
      expect(screen.getByTestId('a')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('b')).toHaveTextContent('1');

    // Изменение через один binding обновляет оба компонента (общий signal).
    await act(async () => {
      await binding.set({ count: 5 });
    });
    expect(screen.getByTestId('a')).toHaveTextContent('5');
    expect(screen.getByTestId('b')).toHaveTextContent('5');
  });

  it('marks ready on defaults when the initial get() rejects', async () => {
    // Reject-ветка connect(): даже при сбое чтения интерфейс становится ready,
    // а значение остаётся дефолтным (устойчивость к повреждённому хранилищу).
    const unwatch = vi.fn();
    const fs: FeatureSettings<Counter> = {
      defaults: { count: 0 },
      get: () => Promise.reject(new Error('storage read failed')),
      set: () => Promise.resolve(),
      update: () => Promise.resolve(),
      reset: () => Promise.resolve(),
      watch: () => unwatch,
    };
    const binding = createSettingsBinding(fs);

    const { unmount } = render(<View binding={binding} tid="rej" />);

    // Компонент выходит из 'loading' в дефолт (count=0), а не зависает.
    await waitFor(() => {
      expect(screen.getByTestId('rej')).toHaveTextContent('0');
    });
    expect(binding.ready.value).toBe(true);
    expect(binding.value.value).toEqual({ count: 0 });

    // Размонтирование последнего подписчика снимает watch (ref-counting).
    unmount();
    expect(unwatch).toHaveBeenCalledTimes(1);
  });
});

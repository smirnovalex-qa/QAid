/**
 * Реактивный биндинг настроек на `@preact/signals`.
 *
 * Один `binding` на namespace (синглтон в `index.ts` фичи) — тогда разные
 * компоненты видят один `signal`. Подписка на хранилище (`watch`) поднимается
 * при монтировании первого компонента и снимается при размонтировании
 * последнего (ref-counting в `useSettings`).
 */
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { FeatureSettings } from '../settings';

export interface SettingsBinding<T> {
  readonly value: Signal<T>;
  set(value: T): Promise<void>;
  update(patch: Partial<T>): Promise<void>;
  reset(): Promise<void>;
  readonly ready: Signal<boolean>; // false до первого успешного get()
}

interface Controller {
  connect(): void;
  disconnect(): void;
}

// Контроллеры подключения хранятся отдельно, чтобы публичный тип binding'а
// оставался чистым (без connect/disconnect в API).
const controllers = new WeakMap<object, Controller>();

export function createSettingsBinding<T>(fs: FeatureSettings<T>): SettingsBinding<T> {
  const value = signal<T>(fs.defaults);
  const ready = signal<boolean>(false);

  let unsub: (() => void) | undefined;
  let refCount = 0;
  let loaded = false;

  const connect = (): void => {
    refCount += 1;
    if (refCount > 1) return;
    unsub = fs.watch((v) => {
      value.value = v;
    });
    if (!loaded) {
      loaded = true;
      void fs
        .get()
        .then((v) => {
          value.value = v;
          ready.value = true;
        })
        .catch(() => {
          ready.value = true; // на дефолтах, но интерфейс готов
        });
    }
  };

  const disconnect = (): void => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && unsub) {
      unsub();
      unsub = undefined;
    }
  };

  const binding: SettingsBinding<T> = {
    value,
    ready,
    set: async (v: T) => {
      value.value = v; // оптимистично; watch подтвердит коэрсированным значением
      await fs.set(v);
    },
    update: (patch: Partial<T>) => fs.update(patch),
    reset: () => fs.reset(),
  };

  controllers.set(binding, { connect, disconnect });
  return binding;
}

/** Подписывает компонент на биндинг: connect на mount, disconnect на unmount. */
export function useSettings<T>(binding: SettingsBinding<T>): SettingsBinding<T> {
  useEffect(() => {
    const ctrl = controllers.get(binding);
    ctrl?.connect();
    return () => {
      ctrl?.disconnect();
    };
  }, [binding]);
  return binding;
}

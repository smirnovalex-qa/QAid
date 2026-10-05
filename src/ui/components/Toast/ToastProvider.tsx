import type { ComponentChildren, JSX } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Toast } from './Toast';
import type { ToastSeverity } from './Toast';
import styles from './Toast.module.css';

export type { ToastSeverity };

export interface ToastOptions {
  severity?: ToastSeverity;
  durationMs?: number;
}

interface ToastContextValue {
  show: (message: string, opts?: ToastOptions) => void;
}

interface ActiveToast {
  id: number;
  message: string;
  severity: ToastSeverity;
}

const DEFAULT_DURATION = 2500;

const ToastContext = createContext<ToastContextValue | null>(null);

/** Провайдер тостов: живые регионы + авто-скрытие по таймеру. */
export function ToastProvider(props: { children?: ComponentChildren }): JSX.Element {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const counter = useRef(0);
  // Активные таймеры по id — чтобы очистить при размонтировании.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number): void => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, opts?: ToastOptions): void => {
      const id = counter.current;
      counter.current += 1;
      const severity = opts?.severity ?? 'info';
      const duration = opts?.durationMs ?? DEFAULT_DURATION;

      setToasts((list) => [...list, { id, message, severity }]);

      const timer = setTimeout(() => {
        remove(id);
      }, duration);
      timers.current.set(id, timer);
    },
    [remove],
  );

  useEffect(() => {
    // Снимок ref: чистим все таймеры при размонтировании провайдера.
    const map = timers.current;
    return () => {
      for (const timer of map.values()) {
        clearTimeout(timer);
      }
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  const polite = toasts.filter((t) => t.severity !== 'danger');
  const assertive = toasts.filter((t) => t.severity === 'danger');

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <div role="status" aria-live="polite" aria-atomic="true" class={styles.container}>
        {polite.map((t) => (
          <Toast key={t.id} message={t.message} severity={t.severity} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" class={styles.container}>
        {assertive.map((t) => (
          <Toast key={t.id} message={t.message} severity={t.severity} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Доступ к тостам; бросает вне провайдера. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

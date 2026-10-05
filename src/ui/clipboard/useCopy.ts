/**
 * Хук копирования: обёртка над `copyText` (TASK-004) со статусом и тостами.
 *
 * Не переизобретает копирование — только оркестрирует UX: реактивный статус
 * (`idle` → `copied`/`error`), тост об успехе/ошибке, авто-сброс статуса по
 * таймеру. Должен использоваться внутри `ToastProvider`.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { copyText } from '@/ui/clipboard';
import { useToast } from '@/ui/components';
import { t } from '@/i18n';

export type CopyStatus = 'idle' | 'copied' | 'error';

export interface UseCopyOptions {
  /** Задержка авто-сброса статуса в `idle`, мс. По умолчанию 1500. */
  readonly resetMs?: number;
  /** Показывать ли тост. По умолчанию true. */
  readonly toast?: boolean;
  /** Текст успешного тоста. По умолчанию `t('toast.copied')`. */
  readonly successLabel?: string;
  /** Текст тоста ошибки. По умолчанию `t('copy.error')`. */
  readonly errorLabel?: string;
}

export interface UseCopyResult {
  readonly copy: (text: string) => Promise<boolean>;
  readonly status: Signal<CopyStatus>;
}

export function useCopy(opts?: UseCopyOptions): UseCopyResult {
  const resetMs = opts?.resetMs ?? 1500;
  const withToast = opts?.toast ?? true;
  const { show } = useToast();

  // Стабильный сигнал статуса, создаётся один раз на всё время жизни хука.
  const statusRef = useRef<Signal<CopyStatus> | null>(null);
  statusRef.current ??= signal<CopyStatus>('idle');
  const status = statusRef.current;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Чистим таймер при размонтировании, чтобы не трогать освобождённый сигнал.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return useMemo<UseCopyResult>(() => {
    const copy = async (text: string): Promise<boolean> => {
      const okFlag = await copyText(text);
      if (timer.current !== null) clearTimeout(timer.current);

      if (okFlag) {
        status.value = 'copied';
        if (withToast) {
          show(opts?.successLabel ?? t('toast.copied'), { severity: 'success' });
        }
        timer.current = setTimeout(() => {
          status.value = 'idle';
        }, resetMs);
        return true;
      }

      status.value = 'error';
      if (withToast) {
        show(opts?.errorLabel ?? t('copy.error'), { severity: 'danger' });
      }
      timer.current = setTimeout(() => {
        status.value = 'idle';
      }, resetMs);
      return false;
    };

    return { copy, status };
    // opts читаются внутри замыкания на момент вызова; зависимости — стабильные примитивы.
  }, [status, resetMs, withToast, show, opts?.successLabel, opts?.errorLabel]);
}

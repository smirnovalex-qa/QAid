import type { JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Toast.module.css';

export type ToastSeverity = 'info' | 'success' | 'danger';

export interface ToastItemProps {
  message: string;
  severity: ToastSeverity;
}

// Соответствие серьёзности → класс варианта.
const severityClass: Record<ToastSeverity, string | undefined> = {
  info: undefined,
  success: styles.success,
  danger: styles.danger,
};

/** Презентационный элемент тоста (используется провайдером). */
export function Toast(props: ToastItemProps): JSX.Element {
  const { message, severity } = props;
  return <div class={cn(styles.toast, severityClass[severity])}>{message}</div>;
}

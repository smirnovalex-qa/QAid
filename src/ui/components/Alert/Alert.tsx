import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Alert.module.css';

export interface AlertProps {
  /** Тон: danger · warn · success · info (accent). */
  tone?: 'danger' | 'warn' | 'success' | 'info';
  /** Необязательный заголовок (жирный) над текстом. */
  title?: string;
  children?: ComponentChildren;
  /**
   * ARIA-роль: `alert` для ошибок (ассертивно озвучивается), `status` для
   * нейтральных сообщений. По умолчанию — `alert` для danger, иначе `status`.
   */
  role?: 'alert' | 'status';
  id?: string;
  class?: string | undefined;
}

/** Блок-уведомление v3: мягкий семантический фон + «ink» текст. */
export function Alert(props: AlertProps): JSX.Element {
  const { tone = 'info', title, children, role, id, class: className } = props;
  const resolvedRole = role ?? (tone === 'danger' ? 'alert' : 'status');
  return (
    <div id={id} role={resolvedRole} class={cn(styles.alert, styles[tone], className)}>
      {title !== undefined ? <div class={styles.title}>{title}</div> : null}
      {children !== undefined && children !== null ? (
        <div class={styles.body}>{children}</div>
      ) : null}
    </div>
  );
}

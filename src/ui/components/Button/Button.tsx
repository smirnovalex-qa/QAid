import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Button.module.css';

export interface ButtonProps {
  /**
   * Вариант. `primary` — акцентная основная кнопка; `secondary` — hairline на
   * поверхности; `ghost` — текстовая; `danger` — сплошная опасная; `live` —
   * активная/стоп-кнопка живой сессии (danger-soft фон + мигающая точка).
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'live';
  /** Размер: sm 32 · md 40 · lg 48 (основное действие экрана). */
  size?: 'sm' | 'md' | 'lg';
  /** Растянуть на всю ширину (основные действия). */
  block?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  class?: string | undefined;
  children?: ComponentChildren;
  onClick?: JSX.IntrinsicElements['button']['onClick'];
  'aria-label'?: string;
  'aria-pressed'?: boolean | 'true' | 'false' | 'mixed';
}

/**
 * Базовая кнопка дизайн-системы v3: варианты, размеры, full-width, состояние
 * загрузки (инлайн-спиннер) и живой вариант с мигающей точкой.
 */
export function Button(props: ButtonProps): JSX.Element {
  const {
    variant = 'primary',
    size = 'lg',
    block = false,
    loading = false,
    type = 'button',
    disabled = false,
    class: className,
    children,
    onClick,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
  } = props;

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      class={cn(styles.root, styles[variant], styles[size], block && styles.block, className)}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      onClick={isDisabled ? undefined : onClick}
    >
      {loading ? <span class={styles.spinner} aria-hidden="true" /> : null}
      {variant === 'live' && !loading ? <span class={styles.liveDot} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Chip.module.css';

export interface ChipProps {
  /** Содержимое (текст чипа). */
  children: ComponentChildren;
  /** Включён ли чип-тумблер. */
  pressed?: boolean;
  onClick?: () => void;
  /** Показывать «✓ » перед текстом во включённом состоянии (цвет — не единственный сигнал). */
  check?: boolean;
  /** Правый счётчик (например «· 3»). */
  count?: number;
  disabled?: boolean;
  class?: string | undefined;
  'aria-label'?: string;
}

/**
 * Чип-тумблер v3: pill 32–36px. On = accent-soft + accent + accent-ink с «✓ »;
 * Off = surface + border-strong + muted. `aria-pressed` для a11y.
 */
export function Chip(props: ChipProps): JSX.Element {
  const {
    children,
    pressed = false,
    onClick,
    check = true,
    count,
    disabled = false,
    class: className,
  } = props;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={props['aria-label']}
      disabled={disabled}
      class={cn(styles.chip, pressed && styles.on, className)}
      onClick={disabled ? undefined : onClick}
    >
      {pressed && check ? (
        <span class={styles.check} aria-hidden="true">
          ✓
        </span>
      ) : null}
      <span class={styles.text}>{children}</span>
      {count !== undefined ? <span class={styles.count}>· {count}</span> : null}
    </button>
  );
}

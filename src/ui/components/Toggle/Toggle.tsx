import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Toggle.module.css';

export interface ToggleProps {
  /** Несущая подпись строки. */
  label: string;
  /** Текущее состояние. */
  checked: boolean;
  /** Обработчик смены (следующее значение). */
  onChange: (next: boolean) => void;
  /** Пояснительная строка под подписью (12px --subtle). */
  help?: string;
  /** Тон хелпа: `warn` — предупреждающий (--warn-ink). */
  helpTone?: 'default' | 'warn';
  /** Иконка слева от подписи. */
  icon?: ComponentChildren;
  /**
   * `card` — контейнер подсвечивается акцентом во включённом состоянии
   * (аудио/каналы); `plain` — без рамки, строка в списке/карточке.
   */
  variant?: 'card' | 'plain';
  disabled?: boolean;
  class?: string | undefined;
}

/**
 * Строка-переключатель v3: подпись (+ опц. иконка и хелп) слева, `Switch` справа.
 * Вся строка — цель (клик по строке переключает), min-height 44. Для a11y строка
 * сама — `role="switch"` с `aria-checked`; вложенный `Switch` декоративен.
 */
export function Toggle(props: ToggleProps): JSX.Element {
  const {
    label,
    checked,
    onChange,
    help,
    helpTone = 'default',
    icon,
    variant = 'plain',
    disabled = false,
    class: className,
  } = props;

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      class={cn(
        styles.root,
        variant === 'card' ? styles.card : styles.plain,
        checked && variant === 'card' && styles.on,
        className,
      )}
      onClick={
        disabled
          ? undefined
          : () => {
              onChange(!checked);
            }
      }
      onKeyDown={
        disabled
          ? undefined
          : (e: KeyboardEvent) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange(!checked);
              }
            }
      }
    >
      <span class={styles.main}>
        {icon !== undefined ? (
          <span class={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span class={styles.text}>
          <span class={styles.label}>{label}</span>
          {help !== undefined ? (
            <span class={cn(styles.help, helpTone === 'warn' && styles.helpWarn)}>{help}</span>
          ) : null}
        </span>
      </span>
      {/* Презентационный переключатель: несущую роль/клик держит строка. */}
      <span class={cn(styles.swTrack, checked && styles.swOn)} aria-hidden="true">
        <span class={styles.swKnob} />
      </span>
    </div>
  );
}

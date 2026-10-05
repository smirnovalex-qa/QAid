import type { JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Switch.module.css';

export interface SwitchProps {
  /** Текущее состояние. */
  checked: boolean;
  /** Обработчик смены (получает следующее значение). */
  onChange: (next: boolean) => void;
  /** Доступная подпись (если переключатель без видимой строки-подписи). */
  'aria-label'?: string;
  /** Связанная подпись (если строка описывает переключатель). */
  'aria-labelledby'?: string;
  disabled?: boolean;
  class?: string | undefined;
}

/**
 * Атомарный переключатель v3: трек 36×22, бел. кнопка 16×16 (3px inset),
 * `left`-анимация .15s. `role="switch"` + `aria-checked`, управляем клавиатурой.
 * Для строк с подписью/хелпом используйте `ToggleRow`, где вся строка — цель.
 */
export function Switch(props: SwitchProps): JSX.Element {
  const { checked, onChange, disabled = false, class: className } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      disabled={disabled}
      class={cn(styles.track, checked && styles.on, className)}
      onClick={
        disabled
          ? undefined
          : () => {
              onChange(!checked);
            }
      }
    >
      <span class={styles.knob} aria-hidden="true" />
    </button>
  );
}

import type { JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './SegmentedControl.module.css';

export interface SegmentOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  /** Опции сегментов (2+). */
  options: SegmentOption[];
  /** Текущее значение. */
  value: string;
  /** Обработчик выбора значения. */
  onChange: (value: string) => void;
  /** Доступное имя группы (уходит в aria-label радиогруппы). */
  label: string;
  size?: 'sm' | 'md';
  class?: string | undefined;
}

// Следующее значение по клавише (с заворачиванием), либо null если не навигация.
function resolveNext(options: SegmentOption[], value: string, key: string): string | null {
  const current = options.findIndex((o) => o.value === value);
  if (current === -1) return null;
  const count = options.length;
  let next: number;
  if (key === 'Home') next = 0;
  else if (key === 'End') next = count - 1;
  else if (key === 'ArrowRight' || key === 'ArrowDown') next = (current + 1) % count;
  else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (current - 1 + count) % count;
  else return null;
  const opt = options[next];
  return opt ? opt.value : null;
}

/**
 * Сегментированный переключатель: `role=radiogroup` c roving tabindex и
 * стрелочной навигацией (←/→/↑/↓, Home/End). Активный сегмент — акцентный фон.
 */
export function SegmentedControl(props: SegmentedControlProps): JSX.Element {
  const { options, value, onChange, label, size = 'md', class: className } = props;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      class={cn(styles.root, styles[size], className)}
      onKeyDown={(event) => {
        const nextValue = resolveNext(options, value, event.key);
        if (nextValue === null) return;
        event.preventDefault();
        onChange(nextValue);
        const btn = event.currentTarget.querySelector<HTMLButtonElement>(
          `[data-value="${CSS.escape(nextValue)}"]`,
        );
        btn?.focus();
      }}
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={opt.value}
            tabIndex={checked ? 0 : -1}
            class={cn(styles.segment, checked && styles.segmentActive)}
            onClick={() => {
              onChange(opt.value);
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

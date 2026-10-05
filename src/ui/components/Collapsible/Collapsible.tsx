import type { ComponentChildren, JSX } from 'preact';
import { useId, useState } from 'preact/hooks';
import { cn } from '@/ui/cn';
import styles from './Collapsible.module.css';

export interface CollapsibleProps {
  /** Подпись строки-кнопки. */
  label: string;
  /** Краткая сводка справа (12px --subtle) — например список активных опций. */
  summary?: string;
  /** Открыт ли по умолчанию (неуправляемый режим). */
  defaultOpen?: boolean;
  /** Управляемое состояние (если задано — компонент контролируется снаружи). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ComponentChildren;
  class?: string | undefined;
}

/**
 * Раскрывающийся блок v3: строка-кнопка (подпись + сводка + ⌄, поворот 180°),
 * контент появляется с `translateY(-4px)→0` за .14s. `aria-expanded` + связь
 * `aria-controls`/`id`.
 */
export function Collapsible(props: CollapsibleProps): JSX.Element {
  const { label, summary, defaultOpen = false, children, class: className } = props;
  const controlled = props.open !== undefined;
  const [internal, setInternal] = useState(defaultOpen);
  const open = controlled ? Boolean(props.open) : internal;
  const panelId = useId();

  const toggle = (): void => {
    const next = !open;
    if (!controlled) setInternal(next);
    props.onToggle?.(next);
  };

  return (
    <div class={cn(styles.root, className)}>
      <button
        type="button"
        class={styles.head}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span class={styles.label}>{label}</span>
        {summary !== undefined ? <span class={styles.summary}>{summary}</span> : null}
        <span class={cn(styles.chevron, open && styles.chevronOpen)} aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </button>
      {open ? (
        <div id={panelId} class={styles.panel}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

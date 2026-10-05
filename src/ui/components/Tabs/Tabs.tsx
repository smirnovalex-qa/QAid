import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  children?: ComponentChildren;
  class?: string | undefined;
}

// Вычисляет id следующей вкладки для стрелок/Home/End (с заворачиванием).
function resolveNextId(tabs: TabItem[], activeId: string, key: string): string | null {
  const current = tabs.findIndex((t) => t.id === activeId);
  if (current === -1) {
    return null;
  }
  const count = tabs.length;
  let nextIndex: number;
  if (key === 'Home') {
    nextIndex = 0;
  } else if (key === 'End') {
    nextIndex = count - 1;
  } else if (key === 'ArrowRight') {
    nextIndex = (current + 1) % count;
  } else if (key === 'ArrowLeft') {
    nextIndex = (current - 1 + count) % count;
  } else {
    return null;
  }
  const next = tabs[nextIndex];
  return next ? next.id : null;
}

/** Табы с roving tabindex и стрелочной навигацией (WAI-ARIA tabs). */
export function Tabs(props: TabsProps): JSX.Element {
  const { tabs, activeId, onChange, children, class: className } = props;

  return (
    <div class={cn(styles.root, className)}>
      <div
        role="tablist"
        class={styles.tablist}
        // Стрелки перемещают активную вкладку и переносят фокус на её кнопку.
        onKeyDown={(event) => {
          const nextId = resolveNextId(tabs, activeId, event.key);
          if (nextId === null) {
            return;
          }
          event.preventDefault();
          onChange(nextId);
          const button = event.currentTarget.querySelector<HTMLButtonElement>(
            `#tab-${CSS.escape(nextId)}`,
          );
          button?.focus();
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              class={cn(styles.tab, selected && styles.tabActive)}
              onClick={() => {
                onChange(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${activeId}`}
        aria-labelledby={`tab-${activeId}`}
        class={styles.panel}
      >
        {children}
      </div>
    </div>
  );
}

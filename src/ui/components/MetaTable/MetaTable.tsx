import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './MetaTable.module.css';

export interface MetaRow {
  /** Ключ (uppercase-подпись). */
  k: string;
  /** Значение (моно). */
  v: ComponentChildren;
}

export interface MetaTableProps {
  rows: MetaRow[];
  /** Заголовок секции над таблицей (uppercase-подпись). */
  caption?: string;
  class?: string | undefined;
}

/**
 * Meta-таблица «ключ → значение» в hairline-рамке (JWT header/claims,
 * timestamp-представления, результат инспектора). Значения моноширинные.
 */
export function MetaTable(props: MetaTableProps): JSX.Element {
  const { rows, caption, class: className } = props;
  return (
    <div class={cn(styles.root, className)}>
      {caption !== undefined ? <div class={styles.caption}>{caption}</div> : null}
      {rows.map((row, i) => (
        <div key={i} class={styles.row}>
          <span class={styles.key}>{row.k}</span>
          <span class={styles.value}>{row.v}</span>
        </div>
      ))}
    </div>
  );
}

import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  label: string;
  children: ComponentChildren;
  // тип берём из intrinsic-элемента, чтобы не тянуть deprecated-алиас
  onClick?: JSX.IntrinsicElements['button']['onClick'];
  disabled?: boolean;
  class?: string | undefined;
  size?: 'sm' | 'md';
}

/** Кнопка-иконка: обязательный label уходит в aria-label для доступности. */
export function IconButton(props: IconButtonProps): JSX.Element {
  const { label, children, onClick, disabled = false, class: className, size = 'md' } = props;

  return (
    <button
      type="button"
      class={cn(styles.root, styles[size], className)}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

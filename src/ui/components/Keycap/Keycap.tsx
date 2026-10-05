import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Keycap.module.css';

export interface KeycapProps {
  children: ComponentChildren;
  class?: string | undefined;
}

/** Клавиша-подсказка v3: моно 11.5px, 1px --border, радиус 5 (⌘K, Esc, Alt). */
export function Keycap(props: KeycapProps): JSX.Element {
  return (
    <kbd class={cn(styles.cap, props.class)} aria-hidden="true">
      {props.children}
    </kbd>
  );
}

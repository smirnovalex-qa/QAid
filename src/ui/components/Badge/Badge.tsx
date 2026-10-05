import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'accent';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ComponentChildren;
  class?: string | undefined;
}

/** Моно-бейдж статуса (VALID/EXPIRED/…): мягкий тон-фон + цветной текст. */
export function Badge(props: BadgeProps): JSX.Element {
  const { tone = 'neutral', children, class: className } = props;
  return <span class={cn(styles.badge, styles[tone], className)}>{children}</span>;
}

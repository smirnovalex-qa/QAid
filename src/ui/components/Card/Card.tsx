import type { ComponentChildren, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Card.module.css';

export interface CardProps {
  title?: string;
  children: ComponentChildren;
  class?: string | undefined;
}

/** Карточка: с title — размеченный регион с заголовком, иначе простой контейнер. */
export function Card(props: CardProps): JSX.Element {
  const { title, children, class: className } = props;

  if (title !== undefined) {
    return (
      <section class={cn(styles.root, className)} aria-label={title}>
        <h3 class={styles.title}>{title}</h3>
        {children}
      </section>
    );
  }

  return <div class={cn(styles.root, className)}>{children}</div>;
}

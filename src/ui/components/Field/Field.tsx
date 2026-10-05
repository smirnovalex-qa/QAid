// Field: обёртка «label + контрол + hint/error», владеет id и aria-связкой.
import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { cn } from '@/ui/cn';
import styles from './Field.module.css';

// Контракт контрола: Field отдаёт id и aria-атрибуты через render-prop.
export interface FieldControlProps {
  id: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (control: FieldControlProps) => JSX.Element;
  class?: string | undefined;
}

export function Field(props: FieldProps): JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // Собираем controlProps условно (exactOptionalPropertyTypes: без undefined).
  const control: FieldControlProps = { id };
  if (props.error) {
    control['aria-invalid'] = true;
    control['aria-describedby'] = errorId;
  } else if (props.hint) {
    control['aria-describedby'] = hintId;
  }

  return (
    <div class={cn(styles.root, props.class)}>
      <label class={styles.label} for={id}>
        {props.label}
      </label>
      {props.children(control)}
      {props.error ? (
        <span id={errorId} role="alert" class={styles.error}>
          {props.error}
        </span>
      ) : props.hint ? (
        <span id={hintId} class={styles.hint}>
          {props.hint}
        </span>
      ) : null}
    </div>
  );
}

// Input: стилизованный текстовый инпут, пробрасывает aria-атрибуты от Field.
import type { GenericEventHandler, JSX } from 'preact';
import { cn } from '@/ui/cn';
import styles from './Input.module.css';

export interface InputProps {
  id?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  class?: string | undefined;
  onInput?: GenericEventHandler<HTMLInputElement>;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function Input(props: InputProps): JSX.Element {
  return (
    <input
      class={cn(styles.root, props.class)}
      type={props.type ?? 'text'}
      {...(props.id !== undefined ? { id: props.id } : {})}
      {...(props.value !== undefined ? { value: props.value } : {})}
      {...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {})}
      {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
      {...(props.onInput !== undefined ? { onInput: props.onInput } : {})}
      {...(props['aria-invalid'] !== undefined ? { 'aria-invalid': props['aria-invalid'] } : {})}
      {...(props['aria-describedby'] !== undefined
        ? { 'aria-describedby': props['aria-describedby'] }
        : {})}
    />
  );
}

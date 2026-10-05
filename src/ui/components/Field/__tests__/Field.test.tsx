import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { Field } from '../Field';
import { Input } from '../../Input/Input';

describe('Field', () => {
  it('связывает label с контролом через for/id', () => {
    render(<Field label="Имя">{(control) => <Input {...control} value="" />}</Field>);
    // getByLabelText находит инпут только при корректной связке label↔control.
    const input = screen.getByLabelText('Имя');
    expect(input.tagName).toBe('INPUT');
  });

  it('при error проставляет aria-invalid и aria-describedby на error-элемент', () => {
    render(
      <Field label="Email" error="Обязательное поле">
        {(control) => <Input {...control} value="" />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Обязательное поле');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('при hint (без error) указывает aria-describedby на hint и не ставит aria-invalid', () => {
    render(
      <Field label="Пароль" hint="Минимум 8 символов">
        {(control) => <Input {...control} value="" />}
      </Field>,
    );
    const input = screen.getByLabelText('Пароль');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy!);
    expect(hint?.textContent).toBe('Минимум 8 символов');
  });
});

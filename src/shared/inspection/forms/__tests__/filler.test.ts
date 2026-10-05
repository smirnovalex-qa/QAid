import { afterEach, describe, expect, it } from 'vitest';
import { formsHandlers } from '@/shared/inspection/forms/filler';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('formsHandlers.fill', () => {
  it('fills text/checkbox/select and dispatches input events; skips disabled/readonly/hidden', async () => {
    document.body.innerHTML = `
      <form>
        <input id="email" type="email" />
        <input id="check" type="checkbox" />
        <select id="sel"><option value="">--</option><option value="a">A</option></select>
        <input id="dis" type="text" disabled />
        <input id="ro" type="text" readonly />
        <input id="hid" type="text" style="display:none" />
      </form>`;

    // Контролируемый инпут: слушатель фиксирует значение из события `input`.
    const email = document.getElementById('email') as HTMLInputElement;
    let observed = '';
    email.addEventListener('input', (e) => {
      observed = (e.target as HTMLInputElement).value;
    });

    const res = await formsHandlers.fill({ tabId: 1, profile: 'valid', seed: 42 });

    // Заполнены только email + checkbox + select (3); disabled/readonly/hidden пропущены.
    expect(res.filled).toBe(3);
    expect(email.value).not.toBe('');
    // Событие `input` действительно продиспатчено с новым значением (нативный сеттер).
    expect(observed).toBe(email.value);

    expect((document.getElementById('check') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('sel') as HTMLSelectElement).value).toBe('a');

    expect((document.getElementById('dis') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('ro') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('hid') as HTMLInputElement).value).toBe('');
  });

  it('is reproducible for a fixed seed', async () => {
    const html = '<input id="e" type="email" />';
    document.body.innerHTML = html;
    await formsHandlers.fill({ tabId: 1, profile: 'valid', seed: 7 });
    const first = (document.getElementById('e') as HTMLInputElement).value;

    document.body.innerHTML = html;
    await formsHandlers.fill({ tabId: 1, profile: 'valid', seed: 7 });
    const second = (document.getElementById('e') as HTMLInputElement).value;

    expect(first).toBe(second);
  });

  it('empty profile clears text and unchecks boxes', async () => {
    document.body.innerHTML = `<input id="t" type="text" value="preset" /><input id="c" type="checkbox" checked />`;
    const res = await formsHandlers.fill({ tabId: 1, profile: 'empty' });
    expect(res.filled).toBe(2);
    expect((document.getElementById('t') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(false);
  });
});

describe('formsHandlers.clear', () => {
  it('clears values and reports the count', async () => {
    document.body.innerHTML = `
      <input id="t" type="text" value="hello" />
      <input id="c" type="checkbox" checked />
      <input id="dis" type="text" value="keep" disabled />`;

    const res = await formsHandlers.clear();
    expect(res.cleared).toBe(2); // disabled пропущен
    expect((document.getElementById('t') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('dis') as HTMLInputElement).value).toBe('keep');
  });
});

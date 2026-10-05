import { afterEach, describe, expect, it } from 'vitest';
import {
  collectForms,
  collectFormControls,
  cssPath,
  FORMS_INSPECTOR_ID,
  readFieldModel,
} from '@/shared/inspection/forms/collector';

/** Инъектируемый источник стилей: по умолчанию всё видимо. */
function styleFor(el: Element): CSSStyleDeclaration {
  const display = (el as HTMLElement).style.display || 'block';
  const visibility = (el as HTMLElement).style.visibility || 'visible';
  return { display, visibility } as unknown as CSSStyleDeclaration;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectForms', () => {
  it('exposes a stable inspector id', () => {
    expect(FORMS_INSPECTOR_ID).toBe('forms');
  });

  it('collects controls, computes labels and kinds, skips service inputs', () => {
    document.body.innerHTML = `
      <form id="f">
        <label for="em">Email</label>
        <input id="em" name="email" type="email" />
        <input id="nolabel" type="text" name="street-address" />
        <textarea id="ta" aria-label="Comments"></textarea>
        <select id="sel"><option value="">--</option><option value="a">A</option></select>
        <input type="hidden" name="csrf" />
        <input type="submit" value="Go" />
        <button type="button">x</button>
      </form>`;

    const model = collectForms(document.body, styleFor);
    const kinds = new Map(model.fields.map((f) => [f.attrs.id, f.kind]));

    // hidden/submit/button отфильтрованы — остаются em, nolabel, ta, sel.
    expect(model.fields).toHaveLength(4);
    expect(kinds.get('em')).toBe('email');
    expect(kinds.get('nolabel')).toBe('address');
    expect(kinds.get('ta')).toBe('textarea');
    expect(kinds.get('sel')).toBe('select');
    expect(model.forms).toHaveLength(1);
    expect(model.forms[0]?.fieldCount).toBe(4);
  });

  it('resolves accessible labels from for/aria-label/aria-labelledby, not placeholder', () => {
    document.body.innerHTML = `
      <label for="a">Given name</label><input id="a" />
      <input id="b" aria-label="Surname" />
      <span id="lbl">City</span><input id="c" aria-labelledby="lbl" />
      <input id="d" placeholder="Only placeholder" />
      <label>Wrapped <input id="e" /></label>`;

    const labels = Object.fromEntries(
      collectFormControls(document.body).map((el) => [
        el.id,
        readFieldModel(el, styleFor).attrs.labelText,
      ]),
    );
    expect(labels.a).toBe('Given name');
    expect(labels.b).toBe('Surname');
    expect(labels.c).toBe('City');
    expect(labels.d).toBeNull(); // placeholder ярлыком не считается
    expect(labels.e).toBe('Wrapped');
  });

  it('flags hidden controls via computed style', () => {
    document.body.innerHTML = `<input id="vis" /><input id="hid" style="display:none" />`;
    const models = collectFormControls(document.body).map((el) => readFieldModel(el, styleFor));
    const hidden = new Map(models.map((m) => [m.attrs.id, m.attrs.hidden]));
    expect(hidden.get('vis')).toBe(false);
    expect(hidden.get('hid')).toBe(true);
  });

  it('builds an id-based selector usable by querySelector', () => {
    document.body.innerHTML = `<div><input id="target" /></div>`;
    const input = document.getElementById('target')!;
    expect(cssPath(input)).toBe('#target');
  });

  it('builds an nth-of-type path when no id is present', () => {
    document.body.innerHTML = `<form><input /><input /></form>`;
    const second = document.querySelectorAll('input')[1]!;
    const sel = cssPath(second);
    expect(sel).toContain(':nth-of-type(2)');
    expect(document.querySelector(sel)).toBe(second);
  });
});

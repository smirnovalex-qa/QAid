/**
 * Юниты сборщика computed-профиля (TASK-054): группы «свойство: значение», разметка
 * цветов, эффективный фон/контраст (переиспользование `dom.ts`), условная группа
 * Flex/Grid по `display`, фильтр шумных значений, allow-list атрибутов (без
 * `value`/произвольного текста) и валидация zod-схемы. jsdom + инъекция `getStyle`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PROP_INSPECTOR_ID, collectElementProps } from '@/shared/inspection/props/collector';
import { parseElementProps } from '@/shared/inspection/props/types';
import { FLEX_GRID_GROUP_ID } from '@/shared/inspection/props/catalog';
import type { PropGroup } from '@/shared/inspection/props/types';

/** Карта кебаб-свойство → вычисленное значение для одного узла. */
type Props = Record<string, string>;

const styleMap = new WeakMap<Element, Props>();

/**
 * Инъектируемый источник стилей: `getPropertyValue` читает кебаб-карту, а
 * camelCase-поля (`color`/`backgroundColor`/…), которые сборщик читает напрямую,
 * проецируются из той же карты — единый источник значений.
 */
function fakeGetStyle(el: Element): CSSStyleDeclaration {
  const props = styleMap.get(el) ?? {};
  const get = (name: string): string => props[name] ?? '';
  return {
    getPropertyValue: get,
    color: get('color'),
    backgroundColor: get('background-color'),
    backgroundImage: get('background-image'),
    fontSize: get('font-size'),
    fontWeight: get('font-weight'),
    display: get('display'),
  } as unknown as CSSStyleDeclaration;
}

function setStyle(el: Element, props: Props): void {
  styleMap.set(el, props);
}

/** Плоский поиск группы по id в результате. */
function group(groups: readonly PropGroup[], id: string): PropGroup | undefined {
  return groups.find((g) => g.id === id);
}

/** Значение свойства внутри группы или undefined. */
function entryValue(
  groups: readonly PropGroup[],
  groupId: string,
  property: string,
): string | undefined {
  return group(groups, groupId)?.entries.find((e) => e.property === property)?.value;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('collectElementProps', () => {
  it('exposes a stable inspector id (backward-compatible with the layer)', () => {
    expect(PROP_INSPECTOR_ID).toBe('probe');
  });

  it('snapshots node identity (tag/id/classes/selector)', () => {
    const el = document.createElement('button');
    el.id = 'submit';
    el.className = 'primary lg';
    document.body.appendChild(el);
    setStyle(el, { display: 'block' });

    const out = collectElementProps(el, fakeGetStyle);
    expect(out.identity.tagName).toBe('button');
    expect(out.identity.id).toBe('submit');
    expect(out.identity.classNames).toEqual(['primary', 'lg']);
    expect(out.identity.selector).toBe('button#submit.primary.lg');
  });

  it('groups curated properties in deterministic order with kinds', () => {
    const el = document.createElement('p');
    document.body.appendChild(el);
    setStyle(el, {
      display: 'block',
      'font-family': 'Inter, sans-serif',
      'font-size': '16px',
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgb(255, 255, 255)',
      'padding-top': '10px',
      'padding-left': '8px',
    });

    const out = collectElementProps(el, fakeGetStyle);
    const groupIds = out.groups.map((g) => g.id);
    // Порядок групп — из каталога (typography → color → boxModel → …).
    expect(groupIds).toEqual(['typography', 'color', 'boxModel', 'layout']);

    expect(entryValue(out.groups, 'typography', 'font-family')).toBe('Inter, sans-serif');
    expect(entryValue(out.groups, 'boxModel', 'padding-top')).toBe('10px');

    // Цветовые свойства размечены `kind: 'color'`.
    const colorEntry = group(out.groups, 'color')?.entries.find((e) => e.property === 'color');
    expect(colorEntry?.kind).toBe('color');
    expect(colorEntry?.value).toBe('rgb(0, 0, 0)');
  });

  it('computes effective background and contrast by reusing dom.ts', () => {
    const el = document.createElement('p');
    document.body.appendChild(el);
    setStyle(el, {
      display: 'block',
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgb(255, 255, 255)',
      'font-size': '16px',
      'font-weight': '400',
    });

    const out = collectElementProps(el, fakeGetStyle);
    expect(out.contrast).not.toBeNull();
    expect(out.contrast?.foreground).toBe('rgba(0, 0, 0, 1)');
    expect(out.contrast?.background).toBe('rgba(255, 255, 255, 1)');
    expect(out.contrast?.ratio).toBeGreaterThan(20); // чёрный на белом ≈ 21
    expect(out.contrast?.large).toBe(false);
    expect(out.contrast?.approximate).toBe(false);
  });

  it('composites the effective background through transparent ancestors', () => {
    const parent = document.createElement('div');
    const el = document.createElement('span');
    parent.appendChild(el);
    document.body.appendChild(parent);
    setStyle(parent, { 'background-color': 'rgb(255, 255, 255)' });
    setStyle(el, {
      display: 'inline',
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgba(0, 0, 0, 0)',
    });

    const out = collectElementProps(el, fakeGetStyle);
    // Прозрачный фон узла → эффективный фон берётся у предка (белый).
    expect(out.contrast?.background).toBe('rgba(255, 255, 255, 1)');
  });

  it('marks contrast approximate over gradient/image backgrounds', () => {
    const el = document.createElement('p');
    document.body.appendChild(el);
    setStyle(el, {
      display: 'block',
      color: 'rgb(0, 0, 0)',
      'background-image': 'linear-gradient(#fff, #000)',
    });

    const out = collectElementProps(el, fakeGetStyle);
    expect(out.contrast?.approximate).toBe(true);
  });

  it('falls back to white background and non-approximate through a fully transparent chain', () => {
    const el = document.createElement('span');
    document.body.appendChild(el);
    setStyle(el, { display: 'inline', color: 'rgb(0, 0, 0)' }); // ни фона, ни картинки нигде

    const out = collectElementProps(el, fakeGetStyle);
    expect(out.contrast?.background).toBe('rgba(255, 255, 255, 1)');
    expect(out.contrast?.approximate).toBe(false);
  });

  it('returns null contrast when the text color is unparseable', () => {
    const el = document.createElement('p');
    document.body.appendChild(el);
    setStyle(el, { display: 'block', color: 'not-a-color' });

    const out = collectElementProps(el, fakeGetStyle);
    expect(out.contrast).toBeNull();
  });

  it('composites semi-transparent text over the effective background', () => {
    const el = document.createElement('p');
    document.body.appendChild(el);
    setStyle(el, {
      display: 'block',
      color: 'rgba(0, 0, 0, 0.5)',
      'background-color': 'rgb(255, 255, 255)',
    });

    const out = collectElementProps(el, fakeGetStyle);
    // Альфа скомпонована на фон → непрозрачный серый.
    expect(out.contrast?.foreground).toBe('rgba(128, 128, 128, 1)');
  });

  it('shows the Flex/Grid group only for flex/grid displays', () => {
    const block = document.createElement('div');
    document.body.appendChild(block);
    setStyle(block, { display: 'block', gap: '8px' });
    expect(
      group(collectElementProps(block, fakeGetStyle).groups, FLEX_GRID_GROUP_ID),
    ).toBeUndefined();

    const flex = document.createElement('div');
    document.body.appendChild(flex);
    setStyle(flex, { display: 'flex', gap: '8px', 'justify-content': 'center' });
    const out = collectElementProps(flex, fakeGetStyle);
    expect(entryValue(out.groups, FLEX_GRID_GROUP_ID, 'gap')).toBe('8px');
    expect(entryValue(out.groups, FLEX_GRID_GROUP_ID, 'justify-content')).toBe('center');
  });

  it('drops noise values (empty / none / normal / auto)', () => {
    const el = document.createElement('p');
    document.body.appendChild(el);
    setStyle(el, {
      display: 'block',
      'font-size': '16px',
      'text-decoration': 'none',
      'letter-spacing': 'normal',
      transform: 'none',
      width: 'auto',
    });

    const out = collectElementProps(el, fakeGetStyle);
    expect(entryValue(out.groups, 'typography', 'text-decoration')).toBeUndefined();
    expect(entryValue(out.groups, 'typography', 'letter-spacing')).toBeUndefined();
    expect(entryValue(out.groups, 'boxModel', 'width')).toBeUndefined();
    // Группа effects целиком отпала — все её значения шумные.
    expect(group(out.groups, 'effects')).toBeUndefined();
    // Осмысленное значение остаётся.
    expect(entryValue(out.groups, 'typography', 'font-size')).toBe('16px');
  });

  it('collects only the curated attribute allow-list (no value/style/arbitrary data-*)', () => {
    const el = document.createElement('input');
    el.setAttribute('type', 'password');
    el.setAttribute('name', 'pwd');
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', 'Password');
    el.setAttribute('data-testid', 'pwd-field');
    el.setAttribute('value', 'hunter2'); // введённые данные — исключить
    el.setAttribute('style', 'color: red'); // косметика — исключить
    el.setAttribute('data-secret', 'leak'); // произвольный data-* — исключить
    document.body.appendChild(el);
    setStyle(el, { display: 'inline-block' });

    const attrs = collectElementProps(el, fakeGetStyle).attributes;
    expect(attrs).toMatchObject({
      type: 'password',
      name: 'pwd',
      role: 'textbox',
      'aria-label': 'Password',
      'data-testid': 'pwd-field',
    });
    expect(attrs).not.toHaveProperty('value');
    expect(attrs).not.toHaveProperty('style');
    expect(attrs).not.toHaveProperty('data-secret');
  });

  it('orders allow-list attributes deterministically', () => {
    const el = document.createElement('a');
    el.setAttribute('aria-current', 'page');
    el.setAttribute('href', '/home');
    el.setAttribute('type', 'button');
    document.body.appendChild(el);
    setStyle(el, { display: 'inline' });

    const keys = Object.keys(collectElementProps(el, fakeGetStyle).attributes);
    // Сначала имена в порядке ATTRIBUTE_ALLOWLIST (type перед href), затем aria-* по алфавиту.
    expect(keys).toEqual(['type', 'href', 'aria-current']);
  });

  it('produces JSON-serializable output validated by the schema', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    setStyle(el, { display: 'block', color: 'rgb(0,0,0)', 'background-color': 'rgb(255,255,255)' });

    const out = collectElementProps(el, fakeGetStyle);
    const roundTripped: unknown = JSON.parse(JSON.stringify(out));
    expect(parseElementProps(roundTripped)).not.toBeNull();
  });

  it('rejects partial/broken input at the schema boundary', () => {
    expect(parseElementProps(null)).toBeNull();
    expect(parseElementProps({ identity: { tagName: 'div' } })).toBeNull();
    expect(parseElementProps({ groups: 'nope' })).toBeNull();
  });
});

/**
 * Эталонные векторы навигации по DOM-иерархии (TASK-052). Чистые функции, jsdom.
 * Источник стилей инъектируется, чтобы детерминированно проверять пропуск `display:none`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { buildPath, describeNode, navigationState, resolveStep } from '../navigation';
import { OVERLAY_HOST_ATTR } from '../dom';

/** Стаб вычисленных стилей: только `display` важен для «значимости». */
function styleStub(hidden: ReadonlySet<Element>): (el: Element) => CSSStyleDeclaration {
  return (el) => ({ display: hidden.has(el) ? 'none' : 'block' }) as unknown as CSSStyleDeclaration;
}

const visible = styleStub(new Set());

afterEach(() => {
  document.body.innerHTML = '';
  for (const node of Array.from(document.querySelectorAll(`[${OVERLAY_HOST_ATTR}]`))) {
    node.remove();
  }
});

describe('resolveStep', () => {
  it('firstChild → первый значимый ребёнок; parent → родитель', () => {
    document.body.innerHTML =
      '<section id="wrap"><span id="a">a</span><span id="b">b</span></section>';
    const wrap = document.getElementById('wrap')!;
    const a = document.getElementById('a')!;

    expect(resolveStep(wrap, 'firstChild', undefined, visible)).toBe(a);
    expect(resolveStep(a, 'parent', undefined, visible)).toBe(wrap);
  });

  it('next/previousSibling ходят по соседям', () => {
    document.body.innerHTML = '<div id="p"><i id="a"></i><i id="b"></i><i id="c"></i></div>';
    const a = document.getElementById('a')!;
    const b = document.getElementById('b')!;
    const c = document.getElementById('c')!;

    expect(resolveStep(a, 'nextSibling', undefined, visible)).toBe(b);
    expect(resolveStep(b, 'nextSibling', undefined, visible)).toBe(c);
    expect(resolveStep(c, 'nextSibling', undefined, visible)).toBeNull(); // крайний правый
    expect(resolveStep(a, 'previousSibling', undefined, visible)).toBeNull(); // крайний левый
    expect(resolveStep(c, 'previousSibling', undefined, visible)).toBe(b);
  });

  it('пропускает служебные (`script`/`style`) и оверлей при ходьбе по детям/соседям', () => {
    document.body.innerHTML =
      '<div id="p"><style>.x{}</style><span id="real">t</span><div ' +
      `${OVERLAY_HOST_ATTR}></div></div>`;
    const p = document.getElementById('p')!;
    const real = document.getElementById('real')!;

    // Первый значимый ребёнок — не <style>, а #real.
    expect(resolveStep(p, 'firstChild', undefined, visible)).toBe(real);
    // Справа от #real только оверлей — значимого соседа нет.
    expect(resolveStep(real, 'nextSibling', undefined, visible)).toBeNull();
  });

  it('пропускает невидимые (`display:none`) узлы', () => {
    document.body.innerHTML = '<div id="p"><span id="hidden"></span><span id="shown"></span></div>';
    const p = document.getElementById('p')!;
    const hidden = document.getElementById('hidden')!;
    const shown = document.getElementById('shown')!;
    const getStyle = styleStub(new Set([hidden]));

    // Скрытый первый ребёнок пропущен → firstChild отдаёт видимый.
    expect(resolveStep(p, 'firstChild', undefined, getStyle)).toBe(shown);
  });

  it('parent поднимается через незначимого предка к ближайшему значимому', () => {
    document.body.innerHTML = '<main id="m"><div id="mid"><b id="leaf">x</b></div></main>';
    const m = document.getElementById('m')!;
    const mid = document.getElementById('mid')!;
    const leaf = document.getElementById('leaf')!;
    const getStyle = styleStub(new Set([mid])); // mid — display:none

    expect(resolveStep(leaf, 'parent', undefined, getStyle)).toBe(m);
  });

  it('границы: нет родителя у корня, нет детей у листа', () => {
    document.body.innerHTML = '<p id="leaf">x</p>';
    const leaf = document.getElementById('leaf')!;
    expect(resolveStep(leaf, 'firstChild', undefined, visible)).toBeNull();
    // У <html> нет родителя-элемента.
    expect(resolveStep(document.documentElement, 'parent', undefined, visible)).toBeNull();
  });

  it('ancestorAtDepth адресует предка по глубине; вне диапазона → null', () => {
    document.body.innerHTML = '<section id="s"><span id="leaf">x</span></section>';
    const leaf = document.getElementById('leaf')!;
    // Цепочка: html(0) > body(1) > section(2) > span(3).
    expect(resolveStep(leaf, 'ancestorAtDepth', 0, visible)).toBe(document.documentElement);
    expect(resolveStep(leaf, 'ancestorAtDepth', 2, visible)).toBe(document.getElementById('s'));
    expect(resolveStep(leaf, 'ancestorAtDepth', 3, visible)).toBe(leaf); // сам узел — no-op
    expect(resolveStep(leaf, 'ancestorAtDepth', 99, visible)).toBeNull();
    expect(resolveStep(leaf, 'ancestorAtDepth', undefined, visible)).toBeNull();
  });
});

describe('describeNode / navigationState', () => {
  it('считает индекс/число соседей и число значимых детей', () => {
    document.body.innerHTML =
      '<div id="p"><span id="a">a</span><span id="b">b</span><style>.x{}</style></div>';
    const p = document.getElementById('p')!;
    const b = document.getElementById('b')!;

    const dp = describeNode(p, visible);
    expect(dp.childElementCount).toBe(2); // <style> не значим

    const db = describeNode(b, visible);
    expect(db.siblingIndex).toBe(1);
    expect(db.siblingCount).toBe(2); // среди значимых соседей
    expect(db.tagName).toBe('span');
    expect(db.selector).toBe('span#b');
  });

  it('navigationState отражает canAscend/canDescend', () => {
    document.body.innerHTML = '<article id="wrap"><em id="leaf">x</em></article>';
    const wrap = document.getElementById('wrap')!;
    const leaf = document.getElementById('leaf')!;

    const sWrap = navigationState(wrap, visible);
    expect(sWrap.canAscend).toBe(true); // body — родитель
    expect(sWrap.canDescend).toBe(true); // есть #leaf

    const sLeaf = navigationState(leaf, visible);
    expect(sLeaf.canDescend).toBe(false); // лист

    // У корня документа подъёма нет.
    expect(navigationState(document.documentElement, visible).canAscend).toBe(false);
  });
});

describe('buildPath', () => {
  it('строит breadcrumb от корня к узлу включительно', () => {
    document.body.innerHTML = '<section id="s"><span id="leaf">x</span></section>';
    const leaf = document.getElementById('leaf')!;
    const path = buildPath(leaf, visible);
    expect(path.map((d) => d.tagName)).toEqual(['html', 'body', 'section', 'span']);
    expect(path[path.length - 1]?.selector).toBe('span#leaf');
    // depth монотонно растёт и совпадает с индексом при неусечённом пути.
    expect(path.map((d) => d.depth)).toEqual([0, 1, 2, 3]);
  });

  it('усекает глубокий путь, сохраняя корень и хвост с текущим узлом', () => {
    // Строим цепочку из 30 вложенных div под body.
    let html = '';
    for (let i = 0; i < 30; i += 1) html += `<div id="d${String(i)}">`;
    html += 'x';
    for (let i = 0; i < 30; i += 1) html += '</div>';
    document.body.innerHTML = html;
    const leaf = document.getElementById('d29')!;

    const path = buildPath(leaf, visible);
    expect(path.length).toBeLessThanOrEqual(12);
    // Корень сохранён…
    expect(path[0]?.tagName).toBe('html');
    // …и текущий узел — последний.
    expect(path[path.length - 1]?.selector).toBe('div#d29');
    // Настоящая глубина хвоста сохранена (для адресного ancestorAtDepth).
    expect(path[path.length - 1]?.depth).toBe(31); // html0 body1 d0..d29 → 31
  });
});

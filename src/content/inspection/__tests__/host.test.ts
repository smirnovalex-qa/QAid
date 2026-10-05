import { afterEach, describe, expect, it } from 'vitest';
import {
  clearInspectors,
  inspectionHandlers,
  installInspectionHost,
  registerInspector,
  toPickedElement,
} from '@/content/inspection/host';
import { AppErrorException } from '@/shared/errors';

/** Драйвит реальный pick: запускает пикер и «кликает» по элементу через событие. */
async function pickElement(el: Element): Promise<void> {
  const pending = inspectionHandlers.pick();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await pending;
}

/** Диспатчит клик по элементу (всплывающий/отменяемый) — как реальный клик мышью. */
function clickOn(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Число смонтированных хостов оверлея в документе. */
function overlayCount(): number {
  return document.querySelectorAll('[data-qatb-overlay]').length;
}

afterEach(async () => {
  await inspectionHandlers.teardown();
  clearInspectors();
  document.body.innerHTML = '';
  for (const node of Array.from(document.querySelectorAll('[data-qatb-overlay]'))) {
    node.remove();
  }
});

describe('toPickedElement', () => {
  it('builds a snapshot with tag, id, classes and selector', () => {
    const el = document.createElement('button');
    el.id = 'submit';
    el.className = 'primary big';
    const snap = toPickedElement(el);
    expect(snap.tagName).toBe('button');
    expect(snap.id).toBe('submit');
    expect(snap.classNames).toEqual(['primary', 'big']);
    expect(snap.selector).toBe('button#submit.primary.big');
    expect(snap.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('omits id from the selector when absent', () => {
    const el = document.createElement('span');
    const snap = toPickedElement(el);
    expect(snap.id).toBeNull();
    expect(snap.selector).toBe('span');
  });
});

describe('inspection handlers', () => {
  it('ping reports readiness', async () => {
    await expect(inspectionHandlers.ping()).resolves.toEqual({ ready: true });
  });

  it('pick returns a snapshot and anchors the element for collect', async () => {
    const el = document.createElement('div');
    el.id = 'anchor';
    document.body.appendChild(el);

    await pickElement(el);
    registerInspector('probe', (node) => ({ tag: node.tagName }));

    const res = await inspectionHandlers.collect({ tabId: 0, inspectorId: 'probe' });
    expect(res).toEqual({ inspectorId: 'probe', data: { tag: 'DIV' } });
  });

  it('collect throws when no element is picked', () => {
    registerInspector('probe', () => 1);
    expect(() => inspectionHandlers.collect({ tabId: 0, inspectorId: 'probe' })).toThrow(
      AppErrorException,
    );
  });

  it('collect throws for an unknown inspector', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    await pickElement(el);
    expect(() => inspectionHandlers.collect({ tabId: 0, inspectorId: 'missing' })).toThrow(
      AppErrorException,
    );
  });

  it('scan прогоняет сборщик по document.body без выбранного якоря', async () => {
    document.body.innerHTML = '<section><span>a</span><span>b</span></section>';
    registerInspector('count', (root) => ({ spans: root.querySelectorAll('span').length }));

    const res = await inspectionHandlers.scan({ tabId: 0, inspectorId: 'count' });
    expect(res).toEqual({ inspectorId: 'count', data: { spans: 2 } });
  });

  it('scan бросает для неизвестного сборщика (синхронно, как collect)', () => {
    expect(() => inspectionHandlers.scan({ tabId: 0, inspectorId: 'missing' })).toThrow(
      AppErrorException,
    );
  });

  it('scan дожидается асинхронного сборщика (Promise)', async () => {
    registerInspector('async', () => Promise.resolve({ ok: true }));
    const res = await inspectionHandlers.scan({ tabId: 0, inspectorId: 'async' });
    expect(res).toEqual({ inspectorId: 'async', data: { ok: true } });
  });

  it('collect тоже дожидается асинхронного сборщика', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    await pickElement(el);
    registerInspector('async', (node) => Promise.resolve({ tag: node.tagName }));
    const res = await inspectionHandlers.collect({ tabId: 0, inspectorId: 'async' });
    expect(res).toEqual({ inspectorId: 'async', data: { tag: 'DIV' } });
  });

  it('highlight находит узел по селектору и поднимает оверлей', async () => {
    document.body.innerHTML = '<button id="go" class="primary">go</button>';
    const res = await inspectionHandlers.highlight({ tabId: 0, selector: '#go' });
    expect(res).toEqual({ found: true });
    expect(document.querySelector('[data-qatb-overlay]')).not.toBeNull();
  });

  it('highlight возвращает found:false для отсутствующего узла (без краха)', async () => {
    const res = await inspectionHandlers.highlight({ tabId: 0, selector: '#nope' });
    expect(res).toEqual({ found: false });
  });

  it('highlight терпим к невалидному селектору (не бросает)', async () => {
    const res = await inspectionHandlers.highlight({ tabId: 0, selector: ')((' });
    expect(res).toEqual({ found: false });
  });

  it('single-flight: новый pick отменяет предыдущий (тот резолвит null)', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const first = inspectionHandlers.pick();
    const second = inspectionHandlers.pick(); // вытесняет первый
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual(expect.objectContaining({ tagName: 'div' }));
  });

  it('teardown прерывает активный (незавершённый) pick', async () => {
    const pending = inspectionHandlers.pick();
    await inspectionHandlers.teardown();
    await expect(pending).resolves.toBeNull();
  });

  it('teardown clears state and removes the overlay', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    await pickElement(el);
    registerInspector('probe', () => 1);

    const res = await inspectionHandlers.teardown();
    expect(res).toEqual({ ok: true });
    expect(document.querySelector('[data-qatb-overlay]')).toBeNull();
    expect(() => inspectionHandlers.collect({ tabId: 0, inspectorId: 'probe' })).toThrow(
      AppErrorException,
    );
  });
});

describe('navigate (TASK-052)', () => {
  it('pick возвращает navigation-состояние выбранного узла', async () => {
    document.body.innerHTML = '<section id="wrap"><span id="leaf">x</span></section>';
    const leaf = document.getElementById('leaf');
    if (leaf === null) throw new Error('fixture');

    await pickElement(leaf);
    const res = await inspectionHandlers.navigate({ tabId: 0, step: 'parent' });
    expect(res).not.toBeNull();
    // Поднялись к #wrap.
    expect(res?.node.selector).toBe('section#wrap');
    expect(res?.canDescend).toBe(true);
    // breadcrumb от html к текущему узлу.
    expect(res?.path.map((d) => d.tagName)).toEqual(['html', 'body', 'section']);
  });

  it('navigate без якоря возвращает null', async () => {
    const res = await inspectionHandlers.navigate({ tabId: 0, step: 'parent' });
    expect(res).toBeNull();
  });

  it('невозможный шаг возвращает текущее состояние без смены якоря', async () => {
    document.body.innerHTML = '<p id="leaf">x</p>';
    const leaf = document.getElementById('leaf');
    if (leaf === null) throw new Error('fixture');
    await pickElement(leaf);

    // У листа нет детей — firstChild не меняет якорь.
    const res = await inspectionHandlers.navigate({ tabId: 0, step: 'firstChild' });
    expect(res?.node.selector).toBe('p#leaf');

    // collect по-прежнему работает на прежнем якоре (#leaf).
    registerInspector('probe', (node) => ({ id: node.getAttribute('id') }));
    const collected = await inspectionHandlers.collect({ tabId: 0, inspectorId: 'probe' });
    expect(collected).toEqual({ inspectorId: 'probe', data: { id: 'leaf' } });
  });

  it('шаги перемещают якорь, collect считается на новом узле', async () => {
    document.body.innerHTML = '<div id="p"><span id="a">a</span><span id="b">b</span></div>';
    const a = document.getElementById('a');
    if (a === null) throw new Error('fixture');
    await pickElement(a);
    registerInspector('id', (node) => ({ id: node.getAttribute('id') }));

    // Уходим к соседу справа (#b) и собираем на нём.
    const res = await inspectionHandlers.navigate({ tabId: 0, step: 'nextSibling' });
    expect(res?.node.selector).toBe('span#b');
    const collected = await inspectionHandlers.collect({ tabId: 0, inspectorId: 'id' });
    expect(collected).toEqual({ inspectorId: 'id', data: { id: 'b' } });
  });

  it('SPA-фолбэк: удалённый якорь деградирует безопасно (null), а не падает', async () => {
    document.body.innerHTML = '<section id="wrap"><span id="leaf">x</span></section>';
    const leaf = document.getElementById('leaf');
    if (leaf === null) throw new Error('fixture');
    await pickElement(leaf);

    // Узел «умер» — удалён из DOM (SPA перерисовала поддерево). У отсоединённого узла
    // `parentElement` уже `null`, живого предка через него не достать → безопасный null,
    // якорь сбрасывается (не исключение).
    leaf.remove();
    const res = await inspectionHandlers.navigate({ tabId: 0, step: 'firstChild' });
    expect(res).toBeNull();
    // Якорь сброшен — повторная навигация тоже даёт null (а не краш).
    expect(await inspectionHandlers.navigate({ tabId: 0, step: 'parent' })).toBeNull();
  });

  it('навигация не мутирует DOM страницы вне оверлея', async () => {
    document.body.innerHTML = '<div id="p"><span id="a">a</span></div>';
    const a = document.getElementById('a');
    if (a === null) throw new Error('fixture');
    await pickElement(a);
    const before = document.getElementById('p')?.outerHTML;

    await inspectionHandlers.navigate({ tabId: 0, step: 'parent' });
    await inspectionHandlers.navigate({ tabId: 0, step: 'firstChild' });

    expect(document.getElementById('p')?.outerHTML).toBe(before);
  });
});

describe('pickLive / pickLiveStop (TASK-056)', () => {
  it('pickLive резолвится по клику снимком узла + navigation и ставит якорь для collect', async () => {
    const el = document.createElement('div');
    el.id = 'anchor';
    document.body.appendChild(el);

    const pending = inspectionHandlers.pickLive();
    clickOn(el);
    const res = await pending;
    expect(res).toEqual(expect.objectContaining({ tagName: 'div' }));
    expect(res?.navigation).toBeDefined();

    // Кликнутый узел стал якорём — collect считается на нём.
    registerInspector('probe', (node) => ({ tag: node.tagName }));
    const collected = await inspectionHandlers.collect({ tabId: 0, inspectorId: 'probe' });
    expect(collected).toEqual({ inspectorId: 'probe', data: { tag: 'DIV' } });
  });

  it('пере-вооружение НЕ ремонтирует оверлей: один хост на всю сессию', async () => {
    document.body.innerHTML = '<div id="outer"><span id="inner">x</span></div>';
    const outer = document.getElementById('outer');
    const inner = document.getElementById('inner');
    if (outer === null || inner === null) throw new Error('fixture');

    const first = inspectionHandlers.pickLive();
    clickOn(outer);
    const firstRes = await first;
    expect(firstRes?.selector).toBe('div#outer');
    expect(overlayCount()).toBe(1);

    // Пере-вооружаем ту же сессию — оверлей не пересоздаётся.
    const second = inspectionHandlers.pickLive();
    expect(overlayCount()).toBe(1);
    clickOn(inner); // уходим глубже
    const secondRes = await second;
    expect(secondRes?.selector).toBe('span#inner');
    expect(overlayCount()).toBe(1);
  });

  it('буферизованный клик: клик между резолвом и re-arm не теряется', async () => {
    document.body.innerHTML = '<a id="one">1</a><b id="two">2</b>';
    const one = document.getElementById('one');
    const two = document.getElementById('two');
    if (one === null || two === null) throw new Error('fixture');

    const first = inspectionHandlers.pickLive();
    clickOn(one);
    await first;

    // Клик ДО следующего pickLive — должен буферизоваться.
    clickOn(two);
    // Теперь вооружаемся — резолвится немедленно буферизованным узлом (без нового клика).
    const buffered = await inspectionHandlers.pickLive();
    expect(buffered?.selector).toBe('b#two');
  });

  it('pickLiveStop останавливает сессию (pending → null), оверлей и якорь сохраняются', async () => {
    document.body.innerHTML = '<section id="wrap"><span id="leaf">x</span></section>';
    const leaf = document.getElementById('leaf');
    if (leaf === null) throw new Error('fixture');

    const first = inspectionHandlers.pickLive();
    clickOn(leaf);
    await first; // якорь = #leaf

    const pending = inspectionHandlers.pickLive();
    const stopRes = await inspectionHandlers.pickLiveStop();
    expect(stopRes).toEqual({ ok: true });
    await expect(pending).resolves.toBeNull();

    // Оверлей НЕ разрушен, якорь сохранён → навигация степпером продолжает работать.
    expect(document.querySelector('[data-qatb-overlay]')).not.toBeNull();
    const nav = await inspectionHandlers.navigate({ tabId: 0, step: 'parent' });
    expect(nav?.node.selector).toBe('section#wrap');
  });

  it('pickLiveStop без активной сессии идемпотентен ({ ok: true })', async () => {
    await expect(inspectionHandlers.pickLiveStop()).resolves.toEqual({ ok: true });
  });

  it('teardown при ожидающем pickLive резолвит его null и снимает оверлей', async () => {
    const pending = inspectionHandlers.pickLive();
    await inspectionHandlers.teardown();
    await expect(pending).resolves.toBeNull();
    expect(document.querySelector('[data-qatb-overlay]')).toBeNull();
  });

  it('Escape на странице резолвит ожидающий pickLive в null', async () => {
    const pending = inspectionHandlers.pickLive();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(pending).resolves.toBeNull();
  });

  it('одноразовый pick после активного live не бросает и резолвится своим кликом', async () => {
    const livePending = inspectionHandlers.pickLive();

    const el = document.createElement('div');
    document.body.appendChild(el);
    // pick гасит живую сессию (её pending → null), затем ведёт собственный выбор.
    const pickPending = inspectionHandlers.pick();
    await expect(livePending).resolves.toBeNull();

    clickOn(el);
    await expect(pickPending).resolves.toEqual(expect.objectContaining({ tagName: 'div' }));
  });
});

describe('registerInspector', () => {
  it('rejects a duplicate id', () => {
    registerInspector('dup', () => 1);
    expect(() => {
      registerInspector('dup', () => 2);
    }).toThrow(/duplicate inspector/);
  });
});

describe('installInspectionHost', () => {
  it('is idempotent (second install returns the same teardown)', () => {
    const first = installInspectionHost();
    const second = installInspectionHost();
    expect(second).toBe(first);
    first();
  });
});

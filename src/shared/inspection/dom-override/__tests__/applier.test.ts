import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { domOverrideHandlers, resetDomOverrideState } from '../applier';
import type { DomOverrideEntry } from '../types';

/** Ждёт доставки колбэков MutationObserver (микротаск/следующий тик). */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function entry(over: Partial<DomOverrideEntry> = {}): DomOverrideEntry {
  return {
    id: over.id ?? 'id-1',
    selector: over.selector ?? '#a',
    label: over.label ?? over.selector ?? '#a',
    op: over.op ?? { kind: 'hide' },
    enabled: over.enabled ?? true,
  };
}

const apply = (entries: DomOverrideEntry[]): Promise<{ applied: number }> =>
  domOverrideHandlers.apply({ tabId: 1, entries });

beforeEach(() => {
  document.body.innerHTML =
    '<p id="a" class="lead">original A</p><span id="b" title="keep">B stays</span>';
});

afterEach(() => {
  resetDomOverrideState();
  document.body.innerHTML = '';
});

describe('domOverride apply/clear (косметика в ISOLATED DOM)', () => {
  it('replace-text заменяет текст выбранного узла и откатывается при clear', async () => {
    const res = await apply([entry({ selector: '#a', op: { kind: 'replace-text', text: 'NEW' } })]);
    expect(res.applied).toBe(1);
    expect(document.querySelector('#a')?.textContent).toBe('NEW');

    const cleared = await domOverrideHandlers.clear();
    expect(cleared).toEqual({ ok: true });
    expect(document.querySelector('#a')?.textContent).toBe('original A');
  });

  it('set-attribute и remove-attribute применяются и точно откатываются', async () => {
    await apply([
      entry({ selector: '#a', id: '1', op: { kind: 'set-attribute', name: 'data-x', value: '9' } }),
      entry({ selector: '#b', id: '2', op: { kind: 'remove-attribute', name: 'title' } }),
    ]);
    expect(document.querySelector('#a')?.getAttribute('data-x')).toBe('9');
    expect(document.querySelector('#b')?.hasAttribute('title')).toBe(false);

    await domOverrideHandlers.clear();
    // Добавленный атрибут снят (его не было), удалённый — восстановлен.
    expect(document.querySelector('#a')?.hasAttribute('data-x')).toBe(false);
    expect(document.querySelector('#b')?.getAttribute('title')).toBe('keep');
  });

  it('hide ставит инлайн display:none и восстанавливает исходный (пустой) стиль', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'hide' } })]);
    expect(document.querySelector<HTMLElement>('#a')!.style.display).toBe('none');
    await domOverrideHandlers.clear();
    expect(document.querySelector<HTMLElement>('#a')!.style.display).toBe('');
  });

  it('inject-content кладёт длинный текст (без разметки)', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'inject-content', text: 'x', repeat: 3 } })]);
    const el = document.querySelector('#a');
    expect(el?.textContent).toBe('x x x');
    // Никакой разметки — только текст (косметика строго текстовая).
    expect(el?.children.length).toBe(0);
  });

  it('list возвращает селекторы применённых подмен', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'hide' } })]);
    expect(await domOverrideHandlers.list()).toEqual({ selectors: ['#a'] });
  });

  it('не найденный/невалидный селектор молча пропускается', async () => {
    const res = await apply([
      entry({ selector: '#missing', id: '1' }),
      entry({ selector: '::::bad', id: '2' }),
    ]);
    expect(res.applied).toBe(0);
  });

  it('отключённые записи не применяются', async () => {
    const res = await apply([entry({ selector: '#a', op: { kind: 'hide' }, enabled: false })]);
    expect(res.applied).toBe(0);
    expect(document.querySelector<HTMLElement>('#a')!.style.display).toBe('');
  });

  it('повторный apply реконсилит набор: снятая подмена откатывается', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'replace-text', text: 'NEW' } })]);
    expect(document.querySelector('#a')?.textContent).toBe('NEW');
    // Новый набор без #a → прежняя подмена откатывается.
    await apply([]);
    expect(document.querySelector('#a')?.textContent).toBe('original A');
  });
});

describe('инвариант: не трогать невыбранные узлы', () => {
  it('подмена #a не меняет #b ни при применении, ни при чужой мутации', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'replace-text', text: 'NEW' } })]);
    const b = document.querySelector('#b');
    expect(b?.textContent).toBe('B stays');
    expect(b?.getAttribute('title')).toBe('keep');

    // Чужая мутация #b: наблюдатель переигрывает подмену #a, но #b не трогает.
    const child = document.createElement('em');
    child.textContent = '!';
    b?.appendChild(child);
    await tick();

    expect(document.querySelector('#b em')).not.toBeNull(); // чужой узел цел
    expect(document.querySelector('#a')?.textContent).toBe('NEW'); // подмена жива
  });
});

describe('MutationObserver: переигрывание с защитой от циклов', () => {
  it('восстанавливает подмену после внешней перезаписи и не зацикливается', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'replace-text', text: 'NEW' } })]);

    // Внешний код «сбивает» текст — наблюдатель должен вернуть подменённое значение.
    const a = document.querySelector<HTMLElement>('#a')!;
    a.textContent = 'hijacked';
    await tick();
    await tick();

    expect(document.querySelector('#a')?.textContent).toBe('NEW');
    // Единственная активная подмена — не размножилась (защита от циклов).
    expect((await domOverrideHandlers.list()).selectors).toEqual(['#a']);
  });

  it('после clear наблюдатель снят — внешние правки больше не переигрываются', async () => {
    await apply([entry({ selector: '#a', op: { kind: 'replace-text', text: 'NEW' } })]);
    await domOverrideHandlers.clear();

    const a = document.querySelector<HTMLElement>('#a')!;
    a.textContent = 'free';
    await tick();
    expect(document.querySelector('#a')?.textContent).toBe('free');
  });
});

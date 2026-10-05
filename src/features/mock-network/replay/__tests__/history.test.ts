import { describe, it, expect } from 'vitest';
import {
  MAX_HISTORY,
  addHistory,
  duplicateHistory,
  makeHistoryEntry,
  removeHistory,
} from '../history';
import type { ReplayHistoryEntry, RequestSpec } from '../../types';

function spec(over?: Partial<RequestSpec>): RequestSpec {
  return {
    method: 'GET',
    url: 'https://x.com/a',
    query: [],
    headers: [],
    body: '',
    bodyMode: 'none',
    ...over,
  };
}

function entry(id: string, over?: Partial<RequestSpec>): ReplayHistoryEntry {
  return makeHistoryEntry(spec(over), 200, { id, now: 111 });
}

describe('makeHistoryEntry', () => {
  it('заполняет id/at/status и клонирует спеку (без разделения ссылок)', () => {
    const src = spec({ query: [{ key: 'a', value: '1', enabled: true }] });
    const e = makeHistoryEntry(src, 204, { id: 'x', now: 42 });
    expect(e).toEqual({ id: 'x', at: 42, status: 204, spec: src });
    // Мутация оригинала не задевает историю.
    src.query[0]!.value = 'MUT';
    expect(e.spec.query[0]?.value).toBe('1');
  });

  it('генерирует id и время по умолчанию', () => {
    const before = Date.now();
    const e = makeHistoryEntry(spec(), null);
    expect(e.id).toMatch(/^replay-/);
    expect(e.status).toBeNull();
    expect(e.at).toBeGreaterThanOrEqual(before);
  });
});

describe('addHistory', () => {
  it('добавляет в начало', () => {
    const list = [entry('a')];
    const next = addHistory(list, entry('b'));
    expect(next.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('обрезает до max', () => {
    let list: ReplayHistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) list = addHistory(list, entry(`e${String(i)}`));
    expect(list.length).toBe(MAX_HISTORY);
    // Самый свежий — впереди.
    expect(list[0]?.id).toBe(`e${String(MAX_HISTORY + 4)}`);
  });

  it('уважает кастомный max', () => {
    const next = addHistory([entry('a'), entry('b')], entry('c'), 2);
    expect(next.map((e) => e.id)).toEqual(['c', 'a']);
  });
});

describe('removeHistory', () => {
  it('удаляет по id; отсутствующий — no-op', () => {
    const list = [entry('a'), entry('b')];
    expect(removeHistory(list, 'a').map((e) => e.id)).toEqual(['b']);
    expect(removeHistory(list, 'zzz').map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('duplicateHistory', () => {
  it('вставляет копию сразу после оригинала', () => {
    const list = [entry('a'), entry('b')];
    const next = duplicateHistory(list, 'a', { id: 'a-copy', now: 5 });
    expect(next.map((e) => e.id)).toEqual(['a', 'a-copy', 'b']);
    expect(next[1]?.spec).toEqual(next[0]?.spec);
  });

  it('отсутствующий id — no-op', () => {
    const list = [entry('a')];
    expect(duplicateHistory(list, 'zzz')).toBe(list);
  });

  it('соблюдает кап', () => {
    const list = [entry('a'), entry('b')];
    const next = duplicateHistory(list, 'a', { id: 'a-copy', now: 5, max: 2 });
    expect(next.map((e) => e.id)).toEqual(['a', 'a-copy']);
  });
});

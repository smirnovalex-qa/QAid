import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLACEHOLDER_UNIT,
  MAX_PLACEHOLDER_REPEAT,
  activeOverrides,
  buildPlaceholder,
  clampRepeat,
  findOverride,
  planApply,
  planUndo,
  removeOverride,
  setOverrideEnabled,
  upsertOverride,
  validateOp,
} from '../logic';
import type { DomWrite } from '../logic';
import type { DomOverrideEntry } from '../types';

/** Хелпер: запись подмены с настраиваемыми полями. */
function entry(over: Partial<DomOverrideEntry> = {}): DomOverrideEntry {
  return {
    id: over.id ?? 'id-1',
    selector: over.selector ?? '#a',
    label: over.label ?? '#a',
    op: over.op ?? { kind: 'hide' },
    enabled: over.enabled ?? true,
  };
}

describe('clampRepeat', () => {
  it('приводит нечисло к 1', () => {
    expect(clampRepeat(Number.NaN)).toBe(1);
    expect(clampRepeat(Number.POSITIVE_INFINITY)).toBe(1);
  });
  it('минимум — 1', () => {
    expect(clampRepeat(0)).toBe(1);
    expect(clampRepeat(-5)).toBe(1);
  });
  it('обрезает дробную часть и клампит по максимуму', () => {
    expect(clampRepeat(3.9)).toBe(3);
    expect(clampRepeat(MAX_PLACEHOLDER_REPEAT + 100)).toBe(MAX_PLACEHOLDER_REPEAT);
  });
});

describe('buildPlaceholder', () => {
  it('повторяет заданную единицу через пробел', () => {
    expect(buildPlaceholder('ab', 3)).toBe('ab ab ab');
  });
  it('пустая единица заменяется дефолтной', () => {
    expect(buildPlaceholder('   ', 1)).toBe(DEFAULT_PLACEHOLDER_UNIT);
  });
  it('клампит число повторов', () => {
    expect(buildPlaceholder('x', 0)).toBe('x');
  });
});

describe('planApply', () => {
  it('replace-text → запись в text', () => {
    expect(planApply({ kind: 'replace-text', text: 'hi' })).toEqual([
      { field: { kind: 'text' }, value: 'hi' },
    ]);
  });
  it('set-attribute → запись в attr', () => {
    expect(planApply({ kind: 'set-attribute', name: 'data-x', value: '1' })).toEqual([
      { field: { kind: 'attr', name: 'data-x' }, value: '1' },
    ]);
  });
  it('remove-attribute → очистка attr (value=null)', () => {
    expect(planApply({ kind: 'remove-attribute', name: 'title' })).toEqual([
      { field: { kind: 'attr', name: 'title' }, value: null },
    ]);
  });
  it('hide → инлайн display:none', () => {
    expect(planApply({ kind: 'hide' })).toEqual([
      { field: { kind: 'style', prop: 'display' }, value: 'none' },
    ]);
  });
  it('inject-content → длинный текст в text', () => {
    const writes = planApply({ kind: 'inject-content', text: 'z', repeat: 4 });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.field).toEqual({ kind: 'text' });
    expect(writes[0]?.value).toBe('z z z z');
  });
});

describe('planUndo', () => {
  it('восстанавливает прежние значения по полям', () => {
    const writes: DomWrite[] = [
      { field: { kind: 'text' }, value: 'new' },
      { field: { kind: 'attr', name: 'a' }, value: 'x' },
    ];
    expect(planUndo(writes, ['old', null])).toEqual([
      { field: { kind: 'text' }, value: 'old' },
      { field: { kind: 'attr', name: 'a' }, value: null },
    ]);
  });
  it('недостающий снимок трактуется как очистка (null)', () => {
    const writes: DomWrite[] = [{ field: { kind: 'style', prop: 'display' }, value: 'none' }];
    expect(planUndo(writes, [])).toEqual([
      { field: { kind: 'style', prop: 'display' }, value: null },
    ]);
  });
});

describe('validateOp', () => {
  it('replace-text и hide валидны всегда', () => {
    expect(validateOp({ kind: 'replace-text', text: '' }).valid).toBe(true);
    expect(validateOp({ kind: 'hide' }).valid).toBe(true);
  });
  it('пустое имя атрибута — ошибка', () => {
    const r = validateOp({ kind: 'set-attribute', name: '   ', value: 'v' });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('attr-name-empty');
  });
  it('недопустимое имя атрибута — ошибка', () => {
    const r = validateOp({ kind: 'remove-attribute', name: '1bad name' });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('attr-name-invalid');
  });
  it('валидное имя атрибута — ок', () => {
    expect(validateOp({ kind: 'set-attribute', name: 'data-test:id_1.x', value: '' }).valid).toBe(
      true,
    );
  });
  it('нецелый/непозитивный repeat — ошибка', () => {
    expect(validateOp({ kind: 'inject-content', text: 'x', repeat: 0 }).errors).toContain(
      'repeat-invalid',
    );
    expect(validateOp({ kind: 'inject-content', text: 'x', repeat: 2.5 }).errors).toContain(
      'repeat-invalid',
    );
  });
  it('валидный inject-content — ок', () => {
    expect(validateOp({ kind: 'inject-content', text: 'x', repeat: 3 }).valid).toBe(true);
  });
});

describe('операции над списком подмен', () => {
  it('findOverride находит по селектору', () => {
    const list = [entry({ selector: '#a' }), entry({ selector: '#b', id: 'id-2' })];
    expect(findOverride(list, '#b')?.id).toBe('id-2');
    expect(findOverride(list, '#nope')).toBeUndefined();
  });

  it('upsertOverride добавляет новый селектор в конец', () => {
    const list = [entry({ selector: '#a' })];
    const next = upsertOverride(list, entry({ selector: '#b', id: 'id-2' }));
    expect(next).toHaveLength(2);
    expect(next[1]?.selector).toBe('#b');
    expect(list).toHaveLength(1); // вход не мутирован
  });

  it('upsertOverride заменяет существующий селектор на месте', () => {
    const list = [entry({ selector: '#a', id: 'old' }), entry({ selector: '#b', id: 'id-2' })];
    const next = upsertOverride(
      list,
      entry({ selector: '#a', id: 'new', op: { kind: 'replace-text', text: 'z' } }),
    );
    expect(next).toHaveLength(2);
    expect(next[0]?.id).toBe('new');
    expect(next[0]?.op).toEqual({ kind: 'replace-text', text: 'z' });
    expect(next[1]?.selector).toBe('#b');
  });

  it('removeOverride убирает по селектору', () => {
    const list = [entry({ selector: '#a' }), entry({ selector: '#b', id: 'id-2' })];
    expect(removeOverride(list, '#a')).toEqual([list[1]]);
  });

  it('setOverrideEnabled переключает только целевую запись', () => {
    const list = [
      entry({ selector: '#a', enabled: true }),
      entry({ selector: '#b', id: 'id-2', enabled: true }),
    ];
    const next = setOverrideEnabled(list, '#a', false);
    expect(next[0]?.enabled).toBe(false);
    expect(next[1]?.enabled).toBe(true);
  });

  it('activeOverrides отбирает включённые', () => {
    const list = [
      entry({ selector: '#a', enabled: true }),
      entry({ selector: '#b', id: 'id-2', enabled: false }),
    ];
    expect(activeOverrides(list).map((e) => e.selector)).toEqual(['#a']);
  });
});

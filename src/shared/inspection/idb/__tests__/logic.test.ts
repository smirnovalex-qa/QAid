import { describe, expect, it } from 'vitest';
import {
  MARKER_KEY,
  decodeKey,
  encodeKey,
  isPortableKey,
  keyDisplay,
  parseEditValue,
  parseSnapshot,
  serializeSnapshot,
  toRecord,
  toSafeJson,
} from '@/shared/inspection/idb/logic';
import type { IdbSnapshot } from '@/shared/inspection/idb/types';

/** Достаёт вид маркера из SafeJson-объекта. */
function markerKind(value: unknown): string | undefined {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const kind = (value as Record<string, unknown>)[MARKER_KEY];
    return typeof kind === 'string' ? kind : undefined;
  }
  return undefined;
}

describe('toSafeJson — примитивы', () => {
  it('пропускает JSON-примитивы без пометки', () => {
    expect(toSafeJson('hello')).toEqual({ value: 'hello', truncated: false });
    expect(toSafeJson(42)).toEqual({ value: 42, truncated: false });
    expect(toSafeJson(true)).toEqual({ value: true, truncated: false });
    expect(toSafeJson(null)).toEqual({ value: null, truncated: false });
  });

  it('усекает длинную строку с пометкой', () => {
    const res = toSafeJson('x'.repeat(20), { maxString: 5 });
    expect(res.truncated).toBe(true);
    expect(res.value).toBe('xxxxx…');
  });

  it('помечает не-конечные числа', () => {
    const res = toSafeJson(Number.POSITIVE_INFINITY);
    expect(res.truncated).toBe(true);
    expect(markerKind(res.value)).toBe('number');
  });

  it('помечает bigint / undefined / function / symbol', () => {
    expect(markerKind(toSafeJson(10n).value)).toBe('bigint');
    expect(markerKind(toSafeJson(undefined).value)).toBe('undefined');
    expect(markerKind(toSafeJson(() => 0).value)).toBe('function');
    expect(markerKind(toSafeJson(Symbol('s')).value)).toBe('symbol');
  });
});

describe('toSafeJson — структурируемые типы', () => {
  it('помечает Date/RegExp', () => {
    const d = toSafeJson(new Date('2020-01-01T00:00:00.000Z'));
    expect(markerKind(d.value)).toBe('date');
    expect((d.value as Record<string, unknown>).iso).toBe('2020-01-01T00:00:00.000Z');
    expect(markerKind(toSafeJson(new Date(NaN)).value)).toBe('date');
    expect(markerKind(toSafeJson(/ab+/gi).value)).toBe('regexp');
  });

  it('помечает Blob/ArrayBuffer/TypedArray', () => {
    expect(markerKind(toSafeJson(new ArrayBuffer(8)).value)).toBe('arraybuffer');
    expect(markerKind(toSafeJson(new Uint8Array([1, 2, 3])).value)).toBe('typedarray');
    expect(markerKind(toSafeJson(new Blob(['abc'])).value)).toBe('blob');
  });

  it('помечает File как file', () => {
    const file = new File(['data'], 'a.txt', { type: 'text/plain' });
    const res = toSafeJson(file);
    expect(markerKind(res.value)).toBe('file');
    expect((res.value as Record<string, unknown>).name).toBe('a.txt');
  });

  it('сериализует Map/Set в маркеры с элементами', () => {
    const map = toSafeJson(
      new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(markerKind(map.value)).toBe('map');
    expect((map.value as Record<string, unknown>).entries).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    const set = toSafeJson(new Set([1, 2]));
    expect(markerKind(set.value)).toBe('set');
    expect((set.value as Record<string, unknown>).items).toEqual([1, 2]);
  });

  it('обходит вложенные объекты и массивы', () => {
    const res = toSafeJson({ a: [1, 2], b: { c: 'x' } });
    expect(res.value).toEqual({ a: [1, 2], b: { c: 'x' } });
    expect(res.truncated).toBe(false);
  });
});

describe('toSafeJson — бюджеты и защита', () => {
  it('усекает по глубине', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const res = toSafeJson(deep, { maxDepth: 2 });
    expect(res.truncated).toBe(true);
  });

  it('усекает по бюджету узлов в массиве', () => {
    const res = toSafeJson([1, 2, 3, 4, 5], { maxNodes: 3 });
    expect(res.truncated).toBe(true);
    expect(Array.isArray(res.value)).toBe(true);
  });

  it('усекает по бюджету узлов в объекте', () => {
    const res = toSafeJson({ a: 1, b: 2, c: 3 }, { maxNodes: 2 });
    expect(res.truncated).toBe(true);
  });

  it('усекает Map/Set по бюджету узлов', () => {
    const map = toSafeJson(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
      { maxNodes: 2 },
    );
    expect(map.truncated).toBe(true);
    const set = toSafeJson(new Set([1, 2, 3]), { maxNodes: 2 });
    expect(set.truncated).toBe(true);
  });

  it('помечает циклические ссылки', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const res = toSafeJson(obj);
    expect(res.truncated).toBe(true);
    const self = (res.value as Record<string, unknown>).self;
    expect(markerKind(self)).toBe('circular');
  });

  it('повторно встреченный (не циклический) объект сериализуется без circular', () => {
    const shared = { x: 1 };
    const res = toSafeJson([shared, shared]);
    expect(res.value).toEqual([{ x: 1 }, { x: 1 }]);
    expect(res.truncated).toBe(false);
  });
});

describe('ключи записей', () => {
  it('isPortableKey распознаёт переносимые ключи', () => {
    expect(isPortableKey('k')).toBe(true);
    expect(isPortableKey(5)).toBe(true);
    expect(isPortableKey(['a', 1, [2]])).toBe(true);
    expect(isPortableKey(new Date())).toBe(false);
    expect(isPortableKey(Number.NaN)).toBe(false);
  });

  it('encodeKey/decodeKey round-trip для строк/чисел/массивов', () => {
    expect(decodeKey(encodeKey('abc') ?? '')).toBe('abc');
    expect(decodeKey(encodeKey(7) ?? '')).toBe(7);
    expect(decodeKey(encodeKey(['a', 1]) ?? '')).toEqual(['a', 1]);
  });

  it('encodeKey возвращает null для непереносимого ключа', () => {
    expect(encodeKey(new Date())).toBeNull();
    expect(encodeKey(new ArrayBuffer(2))).toBeNull();
  });

  it('decodeKey бросает на непереносимом JSON', () => {
    expect(() => decodeKey('{"a":1}')).toThrow();
  });

  it('keyDisplay читаемо форматирует любые ключи', () => {
    expect(keyDisplay('k')).toBe('k');
    expect(keyDisplay(3)).toBe('3');
    expect(keyDisplay(['a', 2])).toBe('[a, 2]');
    expect(keyDisplay(new Date('2020-01-01T00:00:00.000Z'))).toBe('2020-01-01T00:00:00.000Z');
    expect(keyDisplay(new Date(NaN))).toBe('[invalid date]');
    expect(keyDisplay(new ArrayBuffer(4))).toContain('binary');
    expect(keyDisplay(new Uint8Array([1, 2])).includes('binary')).toBe(true);
    expect(keyDisplay(null)).toBe('null');
    expect(keyDisplay(true)).toBe('true');
    expect(keyDisplay({})).toBe('[key]');
  });

  it('toRecord строит переносимую запись', () => {
    const rec = toRecord('id-1', { a: 1 });
    expect(rec).toEqual({
      keyText: '"id-1"',
      keyDisplay: 'id-1',
      value: { a: 1 },
      truncated: false,
    });
    const binary = toRecord(new Date(), new Blob(['x']));
    expect(binary.keyText).toBeNull();
    expect(binary.truncated).toBe(true);
  });
});

describe('parseEditValue', () => {
  it('разбирает валидный JSON', () => {
    expect(parseEditValue('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseEditValue('42')).toEqual({ ok: true, value: 42 });
  });

  it('пустой текст и мусор — ошибка', () => {
    expect(parseEditValue('   ')).toEqual({ ok: false, error: 'empty' });
    expect(parseEditValue('{oops')).toEqual({ ok: false, error: 'invalid-json' });
  });
});

describe('снимок IndexedDB', () => {
  const snapshot: IdbSnapshot = {
    origin: 'https://x.test',
    databases: [
      {
        name: 'db1',
        version: 2,
        stores: [
          {
            name: 's1',
            keyPath: 'id',
            autoIncrement: false,
            indexes: ['byName'],
            count: 1,
            records: [{ keyText: '1', keyDisplay: '1', value: { id: 1 }, truncated: false }],
            truncated: false,
          },
        ],
      },
    ],
  };

  it('serializeSnapshot → parseSnapshot round-trip', () => {
    const text = serializeSnapshot(snapshot);
    const parsed = parseSnapshot(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(snapshot);
  });

  it('parseSnapshot отклоняет мусор и неверную форму', () => {
    expect(parseSnapshot('{oops')).toEqual({ ok: false, error: 'invalid-json' });
    expect(parseSnapshot('{"origin":1}')).toEqual({ ok: false, error: 'invalid-shape' });
  });
});

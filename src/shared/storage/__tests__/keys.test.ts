import { describe, it, expect } from 'vitest';

import { KEY_PREFIX, buildKey, parseKey, isOwnedKey } from '../keys';

describe('buildKey', () => {
  it('строит ключ в формате qatb:v<n>:<ns>:<key>', () => {
    expect(buildKey(2, 'random-numbers', 'last')).toBe('qatb:v2:random-numbers:last');
  });

  it('бросает, если namespace содержит двоеточие', () => {
    expect(() => buildKey(1, 'a:b', 'k')).toThrow();
  });

  it('бросает, если key содержит двоеточие', () => {
    expect(() => buildKey(1, 'ns', 'a:b')).toThrow();
  });
});

describe('parseKey', () => {
  it('round-trip: разбирает вывод buildKey', () => {
    const raw = buildKey(2, 'random-numbers', 'last');
    expect(parseKey(raw)).toEqual({
      schemaVersion: 2,
      namespace: 'random-numbers',
      key: 'last',
    });
  });

  it('возвращает null для чужого префикса', () => {
    expect(parseKey('other:v1:a:b')).toBeNull();
  });

  it('возвращает null для нечисловой версии', () => {
    expect(parseKey('qatb:x:a:b')).toBeNull();
  });

  it('возвращает null, если сегмент версии не начинается с v', () => {
    expect(parseKey('qatb:2:a:b')).toBeNull();
  });

  it('возвращает null при недостаточном числе сегментов', () => {
    expect(parseKey('qatb:v2:a')).toBeNull();
  });

  it('возвращает null при лишних сегментах', () => {
    expect(parseKey('qatb:v2:a:b:c')).toBeNull();
  });

  it('возвращает null при нечисловой версии (v<нечисло>)', () => {
    expect(parseKey('qatb:vx:a:b')).toBeNull();
    expect(parseKey('qatb:v:a:b')).toBeNull();
  });
});

describe('isOwnedKey', () => {
  it('true для наших ключей', () => {
    expect(isOwnedKey(`${KEY_PREFIX}:v2:a:b`)).toBe(true);
  });

  it('false для чужих ключей', () => {
    expect(isOwnedKey('other:v1:a:b')).toBe(false);
  });
});

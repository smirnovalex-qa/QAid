/**
 * Юнит-тесты адаптера сетевой секции (TASK-025 ← TASK-022): отображение снимка
 * `CaughtRequest[]` в секцию артефакта и честная маркировка «недоступно».
 */
import { describe, expect, it } from 'vitest';
import { toNetworkPart } from '../collectors/network';
import type { CaughtRequestSnapshot } from '../collectors/network';

const req = (over: Partial<CaughtRequestSnapshot>): CaughtRequestSnapshot => ({
  id: 1,
  method: 'GET',
  url: 'https://api.test/x',
  status: 200,
  mocked: false,
  ruleId: null,
  source: 'fetch',
  sizeBytes: 0,
  durationMs: 10,
  startedAt: 0,
  error: null,
  ...over,
});

describe('toNetworkPart', () => {
  it('null → недоступно', () => {
    expect(toNetworkPart(null)).toEqual({
      available: false,
      total: 0,
      failed: 0,
      mocked: 0,
      entries: [],
    });
  });

  it('пустой лог → недоступно (не выдаём пустоту за факт «сеть чистая»)', () => {
    expect(toNetworkPart([]).available).toBe(false);
  });

  it('непустой лог → сводка (failed по error/0/4xx-5xx, mocked по флагу)', () => {
    const part = toNetworkPart([
      req({ status: 200, mocked: true }),
      req({ status: 500 }),
      req({ status: 0, error: 'network down' }),
      req({ status: 404 }),
    ]);
    expect(part.available).toBe(true);
    expect(part.total).toBe(4);
    expect(part.mocked).toBe(1);
    expect(part.failed).toBe(3); // 500, 0/error, 404
    expect(part.entries[0]).toMatchObject({ method: 'GET', url: 'https://api.test/x' });
  });
});

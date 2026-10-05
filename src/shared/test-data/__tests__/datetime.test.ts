import { describe, expect, it } from 'vitest';
import { dateInRange, toIsoDate } from '../datetime';
import { recording, seeded } from './support';

const FROM = new Date(Date.UTC(1970, 0, 1));
const TO = new Date(Date.UTC(2005, 11, 31));

describe('dateInRange', () => {
  it('stays within [from, to] inclusive', () => {
    for (let i = 0; i < 500; i += 1) {
      const d = dateInRange(FROM, TO, seeded(i));
      expect(d.getTime()).toBeGreaterThanOrEqual(FROM.getTime());
      expect(d.getTime()).toBeLessThanOrEqual(TO.getTime());
    }
  });

  it('hits the lower bound when the source yields 0', () => {
    expect(dateInRange(FROM, TO, recording([0])).getTime()).toBe(FROM.getTime());
  });

  it('returns `from` when to <= from', () => {
    const d = dateInRange(TO, FROM, seeded(1));
    expect(d.getTime()).toBe(TO.getTime());
    const same = dateInRange(FROM, FROM, seeded(1));
    expect(same.getTime()).toBe(FROM.getTime());
  });

  it('is deterministic for a fixed source', () => {
    expect(dateInRange(FROM, TO, seeded(3)).getTime()).toBe(
      dateInRange(FROM, TO, seeded(3)).getTime(),
    );
  });

  it('selects the offset via below(span) — no modulo-bias over a raw word', () => {
    const src = recording([0]);
    dateInRange(FROM, TO, src);
    expect(src.ns[0]).toBe(TO.getTime() - FROM.getTime() + 1);
  });
});

describe('toIsoDate', () => {
  it('formats as YYYY-MM-DD in UTC', () => {
    expect(toIsoDate(new Date(Date.UTC(2021, 0, 9)))).toBe('2021-01-09');
    expect(toIsoDate(new Date(Date.UTC(1999, 11, 31)))).toBe('1999-12-31');
  });

  it('round-trips a generated date through the ISO shape', () => {
    const iso = toIsoDate(dateInRange(FROM, TO, seeded(7)));
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const year = Number.parseInt(iso.slice(0, 4), 10);
    expect(year).toBeGreaterThanOrEqual(1970);
    expect(year).toBeLessThanOrEqual(2005);
  });
});

/**
 * DST-кейсы для фиче-тестов timestamp-hash (TASK-010): смещение зоны считается
 * ДЛЯ конкретного момента (Intl), а не константой. `offsetMinutes` — знаковое
 * смещение зоны относительно UTC в этот момент (восток — плюс).
 */

export interface DstCase {
  readonly name: string;
  readonly zone: string;
  /** Момент в ISO-8601 (UTC). */
  readonly isoUtc: string;
  /** Ожидаемое смещение зоны в минутах для этого момента. */
  readonly offsetMinutes: number;
  /** Ожидаемое «стенное» время в зоне (YYYY-MM-DD HH:mm:ss). */
  readonly wallClock: string;
}

export const DST_CASES: readonly DstCase[] = [
  // США: EST (зима) vs EDT (лето).
  {
    name: 'New York — зима (EST, UTC-5)',
    zone: 'America/New_York',
    isoUtc: '2021-01-15T12:00:00.000Z',
    offsetMinutes: -300,
    wallClock: '2021-01-15 07:00:00',
  },
  {
    name: 'New York — лето (EDT, UTC-4)',
    zone: 'America/New_York',
    isoUtc: '2021-07-15T12:00:00.000Z',
    offsetMinutes: -240,
    wallClock: '2021-07-15 08:00:00',
  },
  // Европа: CET (зима) vs CEST (лето).
  {
    name: 'Berlin — зима (CET, UTC+1)',
    zone: 'Europe/Berlin',
    isoUtc: '2021-01-15T12:00:00.000Z',
    offsetMinutes: 60,
    wallClock: '2021-01-15 13:00:00',
  },
  {
    name: 'Berlin — лето (CEST, UTC+2)',
    zone: 'Europe/Berlin',
    isoUtc: '2021-07-15T12:00:00.000Z',
    offsetMinutes: 120,
    wallClock: '2021-07-15 14:00:00',
  },
  // Зона без DST (эталон постоянного смещения).
  {
    name: 'Tokyo — без DST (JST, UTC+9)',
    zone: 'Asia/Tokyo',
    isoUtc: '2021-07-15T12:00:00.000Z',
    offsetMinutes: 540,
    wallClock: '2021-07-15 21:00:00',
  },
];

/**
 * Кейсы часовых поясов, включая границы перехода на летнее время (DST).
 * `expectedOffsetMinutes` и `expectedInZone` рассчитаны вручную для КОНКРЕТНОГО
 * момента — чтобы поймать регресс «константного» смещения вместо DST-корректного.
 */

export interface TzCase {
  name: string;
  /** UTC ISO-8601 входного момента. */
  iso: string;
  /** IANA-зона или UTC. */
  zone: string;
  /** Ожидаемое смещение зоны в минутах для этого момента. */
  expectedOffsetMinutes: number;
  /** Ожидаемое «стенное» время в зоне (`YYYY-MM-DD HH:MM:SS`). */
  expectedInZone: string;
}

export const TZ_CASES: TzCase[] = [
  {
    name: 'UTC — тождественно',
    iso: '2021-07-01T12:00:00.000Z',
    zone: 'UTC',
    expectedOffsetMinutes: 0,
    expectedInZone: '2021-07-01 12:00:00',
  },
  {
    name: 'New York — лето (EDT, UTC-4)',
    iso: '2021-07-01T12:00:00.000Z',
    zone: 'America/New_York',
    expectedOffsetMinutes: -240,
    expectedInZone: '2021-07-01 08:00:00',
  },
  {
    name: 'New York — зима (EST, UTC-5)',
    iso: '2021-01-01T12:00:00.000Z',
    zone: 'America/New_York',
    expectedOffsetMinutes: -300,
    expectedInZone: '2021-01-01 07:00:00',
  },
  {
    name: 'New York — до spring-forward (EST)',
    iso: '2021-03-14T06:30:00.000Z',
    zone: 'America/New_York',
    expectedOffsetMinutes: -300,
    expectedInZone: '2021-03-14 01:30:00',
  },
  {
    name: 'New York — момент spring-forward (переход в EDT)',
    iso: '2021-03-14T07:00:00.000Z',
    zone: 'America/New_York',
    expectedOffsetMinutes: -240,
    expectedInZone: '2021-03-14 03:00:00',
  },
  {
    name: 'Berlin — лето (CEST, UTC+2)',
    iso: '2021-07-01T00:00:00.000Z',
    zone: 'Europe/Berlin',
    expectedOffsetMinutes: 120,
    expectedInZone: '2021-07-01 02:00:00',
  },
  {
    name: 'Berlin — зима (CET, UTC+1)',
    iso: '2021-01-01T00:00:00.000Z',
    zone: 'Europe/Berlin',
    expectedOffsetMinutes: 60,
    expectedInZone: '2021-01-01 01:00:00',
  },
];

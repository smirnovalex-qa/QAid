import { describe, it, expect } from 'vitest';
import { THROTTLE_PROFILES, computeThrottleDelay, transferDelayMs } from '../throttle';

describe('transferDelayMs', () => {
  it('нет ограничения/нулевой размер → 0', () => {
    expect(transferDelayMs(1000, null)).toBe(0);
    expect(transferDelayMs(1000, 0)).toBe(0);
    expect(transferDelayMs(1000, -5)).toBe(0);
    expect(transferDelayMs(0, 400)).toBe(0);
    expect(transferDelayMs(-10, 400)).toBe(0);
  });

  it('время передачи = ceil(sizeBytes·8 / kbps) мс', () => {
    // 1000 байт = 8000 бит; при 400 кбит/с → 20 мс.
    expect(transferDelayMs(1000, 400)).toBe(20);
    // Округление вверх: 1 байт при 50 кбит/с → ceil(8/50)=1 мс, не 0.
    expect(transferDelayMs(1, 50)).toBe(1);
  });
});

describe('computeThrottleDelay', () => {
  it('суммирует фиксированную и транспортную задержки', () => {
    expect(computeThrottleDelay(1000, { delayMs: 100, throttleKbps: 400 })).toBe(120);
  });

  it('только фиксированная, если канал не ограничен', () => {
    expect(computeThrottleDelay(1000, { delayMs: 100, throttleKbps: null })).toBe(100);
  });

  it('только транспортная, если фиксированной нет', () => {
    expect(computeThrottleDelay(1000, { delayMs: 0, throttleKbps: 400 })).toBe(20);
  });

  it('отрицательная фиксированная задержка приводится к 0', () => {
    expect(computeThrottleDelay(0, { delayMs: -50, throttleKbps: null })).toBe(0);
  });

  it('дробная фиксированная задержка усекается (floor)', () => {
    expect(computeThrottleDelay(0, { delayMs: 10.9, throttleKbps: null })).toBe(10);
  });
});

describe('THROTTLE_PROFILES', () => {
  it('офлайн-профиль помечен offline и без скорости', () => {
    const offline = THROTTLE_PROFILES.find((p) => p.id === 'offline');
    expect(offline?.offline).toBe(true);
    expect(offline?.kbps).toBeNull();
  });

  it('скоростные профили имеют положительный kbps и не offline', () => {
    for (const p of THROTTLE_PROFILES.filter((x) => !x.offline)) {
      expect(p.kbps).not.toBeNull();
      expect(p.kbps ?? 0).toBeGreaterThan(0);
    }
  });
});

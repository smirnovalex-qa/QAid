/**
 * Проверка MAIN-world оверрайдов в jsdom. Покрываем каналы, надёжно наблюдаемые в
 * jsdom (язык, геолокация, снятие). UA/Intl-подмена проверяется e2e на реальной
 * странице (load-unpacked) — в jsdom их поведение неполно.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyEnvironmentOverrides, clearEnvironmentOverrides } from '../overrides';
import { EMPTY_ENVIRONMENT_CONFIG, EMPTY_GEO } from '../types';

afterEach(() => {
  clearEnvironmentOverrides();
  vi.restoreAllMocks();
});

function stubGeolocation(): {
  getCurrentPosition: ReturnType<typeof vi.fn>;
  watchPosition: ReturnType<typeof vi.fn>;
} {
  const stub = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(() => 1) };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: stub });
  return stub;
}

describe('applyEnvironmentOverrides', () => {
  it('подменяет navigator.language/languages и снимает по restore', () => {
    applyEnvironmentOverrides({
      ...EMPTY_ENVIRONMENT_CONFIG,
      acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
    });
    expect(navigator.language).toBe('fr-FR');
    expect(navigator.languages).toEqual(['fr-FR', 'fr', 'en']);

    clearEnvironmentOverrides();
    // Own-property удалён — язык больше не эмулируемый.
    expect(navigator.language).not.toBe('fr-FR');
  });

  it('перехватывает getCurrentPosition в режиме coords', () => {
    stubGeolocation();
    applyEnvironmentOverrides({
      ...EMPTY_ENVIRONMENT_CONFIG,
      geo: { mode: 'coords', latitude: 12.5, longitude: -7.25, accuracy: 3, errorCode: 1 },
    });
    const success = vi.fn();
    navigator.geolocation.getCurrentPosition(success);
    expect(success).toHaveBeenCalledOnce();
    const pos = success.mock.calls[0]?.[0] as GeolocationPosition;
    expect(pos.coords.latitude).toBe(12.5);
    expect(pos.coords.longitude).toBe(-7.25);
    expect(pos.coords.accuracy).toBe(3);
  });

  it('режим error вызывает error-callback с заданным кодом', () => {
    stubGeolocation();
    applyEnvironmentOverrides({
      ...EMPTY_ENVIRONMENT_CONFIG,
      geo: { ...EMPTY_GEO, mode: 'error', errorCode: 2 },
    });
    const success = vi.fn();
    const error = vi.fn();
    navigator.geolocation.getCurrentPosition(success, error);
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    const err = error.mock.calls[0]?.[0] as GeolocationPositionError;
    expect(err.code).toBe(2);
  });

  it('повторный apply не накладывается: restore возвращает исходные методы', () => {
    const stub = stubGeolocation();
    const original = stub.getCurrentPosition;
    applyEnvironmentOverrides({
      ...EMPTY_ENVIRONMENT_CONFIG,
      geo: { ...EMPTY_GEO, mode: 'coords', latitude: 1, longitude: 2 },
    });
    // Метод подменён.
    expect(navigator.geolocation.getCurrentPosition).not.toBe(original);
    applyEnvironmentOverrides({
      ...EMPTY_ENVIRONMENT_CONFIG,
      geo: { ...EMPTY_GEO, mode: 'coords', latitude: 3, longitude: 4 },
    });
    clearEnvironmentOverrides();
    // После снятия — исходный метод стаба возвращён (без «слоёв» патчей).
    expect(navigator.geolocation.getCurrentPosition).toBe(original);
  });
});

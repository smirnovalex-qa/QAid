/**
 * Контракт самодостаточности MAIN-инъектируемых оверрайдов окружения (ADR-0028).
 *
 * Как и перехватчик мока, эти функции уходят в страницу через
 * `executeScript({ world:'MAIN', func })` и сериализуются без замыкания модуля.
 * `overrides.test.ts` дергает их напрямую (область модуля цела) и потому не ловит
 * утечку модульного биндинга. Здесь прогоняем apply → restore ЧЕРЕЗ `reserialize`,
 * реконструируя функции в чистой области — ровно как MAIN-world.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { reserialize } from '../../../../tests/support/reserialize';
import { applyEnvironmentOverrides, clearEnvironmentOverrides } from '../overrides';
import { EMPTY_ENVIRONMENT_CONFIG } from '../types';

const STATE_KEY = '__qatbEnvOverrides__';

function winState(): unknown {
  return (window as unknown as Record<string, unknown>)[STATE_KEY];
}

afterEach(() => {
  reserialize(clearEnvironmentOverrides)();
});

describe('MAIN-инъекция оверрайдов окружения: самодостаточность (reserialize)', () => {
  it('apply через сериализацию подменяет язык и ставит состояние (нет утечки модуля)', () => {
    const apply = reserialize(applyEnvironmentOverrides);
    // ReferenceError здесь = ссылка на модульный биндинг в теле (как в странице).
    apply({ ...EMPTY_ENVIRONMENT_CONFIG, acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8' });

    expect(navigator.language).toBe('fr-FR');
    expect(navigator.languages).toEqual(['fr-FR', 'fr', 'en']);
    expect(winState()).toBeDefined();
  });

  it('clear через сериализацию снимает оверрайды и забывает состояние', () => {
    const apply = reserialize(applyEnvironmentOverrides);
    const clear = reserialize(clearEnvironmentOverrides);

    apply({ ...EMPTY_ENVIRONMENT_CONFIG, acceptLanguage: 'de-DE' });
    expect(navigator.language).toBe('de-DE');

    clear();
    expect(navigator.language).not.toBe('de-DE');
    expect(winState()).toBeUndefined();
  });
});

/**
 * Контракт самодостаточности MAIN-инъектируемых функций перехватчика (ADR-0028).
 *
 * Перехватчик уходит в страницу через `executeScript({ world:'MAIN', func })` —
 * Chrome сериализует его как `func.toString()`, БЕЗ замыкания модуля. Обычные
 * юнит-тесты (`logic.test.ts`) дергают функции напрямую в области модуля, поэтому
 * НЕ ловят утечку модульного биндинга (например, вынесенной константы ключа).
 *
 * Здесь мы прогоняем `install → fetch → readLog → clear` ЧЕРЕЗ `reserialize`,
 * которая реконструирует функции из их исходника в чистой области (`new Function`)
 * — ровно как MAIN-world. Любая свободная ссылка на модуль → `ReferenceError`, и
 * тест краснеет. Это регрессионный guard на весь класс бага, а не на один символ.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { reserialize } from '../../../../tests/support/reserialize';
import { clearMockInterceptor, installMockInterceptor, readMockLog } from '../interceptor';
import type { CompiledRule, InterceptorState } from '../types';

const STORE_KEY = '__qatbMock__';

/** Правило: любой URL c подстрокой `api` → синтетический JSON 200. */
const apiRule: CompiledRule = {
  id: 'r1',
  methods: ['GET'],
  urlRegexSource: 'api',
  urlRegexFlags: '',
  headerPredicates: [],
  action: {
    status: 200,
    statusText: '',
    headers: [],
    bodyMode: 'json',
    body: '{"ok":true}',
    delayMs: 0,
    throttleKbps: null,
    offline: false,
  },
  remaining: null,
};

const state: InterceptorState = { rules: [apiRule], logCap: 200, bodyCap: 65_536 };

function winStore(): unknown {
  return (window as unknown as Record<string, unknown>)[STORE_KEY];
}

afterEach(() => {
  // Снятие через реконструированную функцию — восстанавливает fetch/XHR/state.
  reserialize(clearMockInterceptor)();
});

describe('MAIN-инъекция перехватчика: самодостаточность (reserialize)', () => {
  it('install через сериализацию ставит состояние на window (нет утечки модуля)', () => {
    window.fetch = () => Promise.resolve(new Response('real', { status: 200 }));

    const install = reserialize(installMockInterceptor);
    // Если тело функции ссылается на модульный биндинг (STORE_KEY и т.п.) —
    // здесь будет ReferenceError, как в реальной MAIN-world странице.
    install(state);

    expect(winStore()).toBeDefined();
  });

  it('полный цикл install → mocked fetch → passthrough → readLog → clear', async () => {
    window.fetch = () => Promise.resolve(new Response('real', { status: 200 }));

    const install = reserialize(installMockInterceptor);
    const read = reserialize(readMockLog);
    const clear = reserialize(clearMockInterceptor);

    install(state);

    // Совпадение с правилом → синтетический ответ (реальная сеть не вызывается).
    const mocked = await window.fetch('https://example.test/api/data');
    expect(mocked.status).toBe(200);
    expect(await mocked.text()).toBe('{"ok":true}');

    // Не совпало → passthrough к оригиналу.
    const passthrough = await window.fetch('https://example.test/other');
    expect(await passthrough.text()).toBe('real');

    const log = read();
    expect(log).toHaveLength(2);
    expect(log[0]?.mocked).toBe(true);
    expect(log[0]?.url).toContain('/api/');
    expect(log[1]?.mocked).toBe(false);

    clear();
    expect(winStore()).toBeUndefined();
    // После снятия лог недоступен (состояние забыто) — read даёт пустой снимок.
    expect(read()).toEqual([]);
  });

  it('офлайн-правило (TASK-023): fetch падает сетевой ошибкой, лог помечает mocked', async () => {
    window.fetch = () => Promise.resolve(new Response('real', { status: 200 }));

    const offlineRule: CompiledRule = {
      ...apiRule,
      action: { ...apiRule.action, offline: true },
    };
    const install = reserialize(installMockInterceptor);
    const read = reserialize(readMockLog);

    install({ rules: [offlineRule], logCap: 200, bodyCap: 65_536 });

    await expect(window.fetch('https://example.test/api/data')).rejects.toThrow(TypeError);

    const log = read();
    expect(log).toHaveLength(1);
    expect(log[0]?.mocked).toBe(true);
    expect(log[0]?.status).toBe(0);
    expect(log[0]?.error).toContain('offline');
  });
});

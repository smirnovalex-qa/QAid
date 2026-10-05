/**
 * Прекомпиляция URL-regex перехватчика (F5 TASK-046).
 *
 * Регрессионный guard: `matchRule` раньше строил `new RegExp(...)` на КАЖДЫЙ
 * перехваченный fetch/XHR. Теперь regex компилируется ОДИН РАЗ при установке/обновлении
 * набора правил и переиспользуется. Тесты проверяют (1) что компиляция происходит на
 * install и не повторяется на запросах, (2) что семантика матчинга не изменилась
 * (совпало → синтетика, не совпало → passthrough, невалидный паттерн → не матчится),
 * (3) что переустановка с новым набором пересобирает regex.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearMockInterceptor, installMockInterceptor, readMockLog } from '../interceptor';
import type { CompiledRule, InterceptorState } from '../types';

function rule(over: Partial<CompiledRule> = {}): CompiledRule {
  return {
    id: over.id ?? 'r1',
    methods: over.methods ?? [],
    urlRegexSource: over.urlRegexSource ?? 'api',
    urlRegexFlags: over.urlRegexFlags ?? '',
    headerPredicates: over.headerPredicates ?? [],
    action: {
      status: 200,
      statusText: '',
      headers: [],
      bodyMode: 'json',
      body: '{"ok":true}',
      delayMs: 0,
      throttleKbps: null,
      offline: false,
      ...(over.action ?? {}),
    },
    remaining: over.remaining ?? null,
  };
}

const state = (rules: CompiledRule[]): InterceptorState => ({
  rules,
  logCap: 200,
  bodyCap: 65_536,
});

afterEach(() => {
  clearMockInterceptor();
});

describe('mock interceptor: прекомпиляция regex (F5)', () => {
  it('компилирует regex один раз на install, а не на каждый запрос', async () => {
    window.fetch = () => Promise.resolve(new Response('real', { status: 200 }));

    const OrigRegExp = globalThis.RegExp;
    let ctorCount = 0;
    const Counting = new Proxy(OrigRegExp, {
      construct(target, args) {
        ctorCount += 1;
        return Reflect.construct(target, args as ConstructorParameters<typeof RegExp>);
      },
    });
    // Временная подмена глобального конструктора только для замера числа компиляций.
    globalThis.RegExp = Counting;
    try {
      installMockInterceptor(state([rule({ id: 'a', urlRegexSource: 'api', methods: ['GET'] })]));
      const afterInstall = ctorCount;
      expect(afterInstall).toBe(1); // один regex на одно правило

      // Три перехваченных запроса не должны добавить ни одной компиляции.
      await window.fetch('https://x.test/api/1');
      await window.fetch('https://x.test/api/2');
      await window.fetch('https://x.test/other');
      expect(ctorCount).toBe(afterInstall);
    } finally {
      globalThis.RegExp = OrigRegExp;
    }
  });

  it('семантика матчинга не изменилась: совпало → синтетика, не совпало → passthrough', async () => {
    window.fetch = () => Promise.resolve(new Response('real', { status: 200 }));

    installMockInterceptor(
      state([
        rule({ id: 'valid', urlRegexSource: 'api', methods: ['GET'] }),
        rule({ id: 'bad', urlRegexSource: '(' }), // невалидный паттерн — не должен матчиться/ронять
      ]),
    );

    const mocked = await window.fetch('https://x.test/api/data');
    expect(mocked.status).toBe(200);
    expect(await mocked.text()).toBe('{"ok":true}');

    const passthrough = await window.fetch('https://x.test/nomatch');
    expect(await passthrough.text()).toBe('real');

    const log = readMockLog();
    expect(log.find((e) => e.url.includes('/api/'))?.mocked).toBe(true);
    expect(log.find((e) => e.url.includes('nomatch'))?.mocked).toBe(false);
  });

  it('переустановка с новым набором пересобирает regex (идемпотентно)', async () => {
    window.fetch = () => Promise.resolve(new Response('real', { status: 200 }));

    installMockInterceptor(state([rule({ id: 'a', urlRegexSource: 'alpha' })]));
    // Обновляем набор: теперь матчится другой паттерн, старый — нет.
    installMockInterceptor(state([rule({ id: 'b', urlRegexSource: 'beta' })]));

    const beta = await window.fetch('https://x.test/beta');
    expect(await beta.text()).toBe('{"ok":true}');

    const alpha = await window.fetch('https://x.test/alpha');
    expect(await alpha.text()).toBe('real'); // старое правило больше не действует
  });
});

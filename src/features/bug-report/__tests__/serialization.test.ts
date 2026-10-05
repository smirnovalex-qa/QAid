/**
 * Контракт самодостаточности MAIN-инъектируемых функций сборщика консоли (ADR-0028).
 *
 * Кольцевой буфер уходит в страницу через `executeScript({ world:'MAIN', func })` —
 * Chrome сериализует его как `func.toString()`, БЕЗ замыкания модуля. Обычные
 * юнит-тесты дергают функции напрямую в области модуля и НЕ ловят утечку модульного
 * биндинга (например, вынесенной константы ключа стора `STORE_KEY`).
 *
 * Здесь мы прогоняем `install → emit → read → clear` ЧЕРЕЗ `reserialize`, которая
 * реконструирует функции из их исходника в чистой области (`new Function`) — ровно
 * как MAIN-world. Любая свободная ссылка на модуль → `ReferenceError`, и тест
 * краснеет. Это регрессионный guard на весь класс бага: если вынести `STORE_KEY`
 * (или любой хелпер) на уровень модуля, реконструированный `install` упадёт здесь.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { reserialize } from '../../../../tests/support/reserialize';
import { clearConsoleBuffer, installConsoleBuffer, readConsoleBuffer } from '../collectors/console';

const STORE_KEY = '__qatbConsole__';

function winStore(): unknown {
  return (window as unknown as Record<string, unknown>)[STORE_KEY];
}

afterEach(() => {
  // Снятие через реконструированную функцию — восстанавливает console/слушатели/стор.
  reserialize(clearConsoleBuffer)();
});

describe('MAIN-инъекция буфера консоли: самодостаточность (reserialize)', () => {
  it('install через сериализацию ставит стор на window (нет утечки модуля)', () => {
    const install = reserialize(installConsoleBuffer);
    // Если тело функции ссылается на модульный биндинг (STORE_KEY, хелпер) —
    // здесь будет ReferenceError, как на реальной MAIN-world странице.
    install(50);
    expect(winStore()).toBeDefined();
  });

  it('полный цикл install → console.error → window error → read → clear', () => {
    const install = reserialize(installConsoleBuffer);
    const read = reserialize(readConsoleBuffer);
    const clear = reserialize(clearConsoleBuffer);

    install(50);

    // Перехват обёртки console.
    console.error('boom');
    console.warn('be careful');

    // Перехват глобальной ошибки страницы (window.onerror).
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'kaboom', error: new Error('kaboom') }),
    );

    // Перехват необработанного reject (конструктора PromiseRejectionEvent в jsdom нет —
    // эмулируем совместимой формой события с полем reason).
    const rej = new Event('unhandledrejection');
    (rej as unknown as { reason: unknown }).reason = new Error('nope');
    window.dispatchEvent(rej);

    const log = read();
    expect(log).toHaveLength(4);
    expect(log[0]).toMatchObject({ level: 'error', source: 'console' });
    expect(log[0]?.text).toContain('boom');
    expect(log[1]).toMatchObject({ level: 'warn', source: 'console' });
    expect(log[2]).toMatchObject({ level: 'error', source: 'onerror' });
    expect(log[2]?.text).toContain('kaboom');
    expect(log[3]).toMatchObject({ level: 'error', source: 'unhandledrejection' });
    expect(log[3]?.text).toContain('nope');

    clear();
    expect(winStore()).toBeUndefined();
    // После снятия буфер недоступен (стор забыт) — read даёт пустой снимок.
    expect(read()).toEqual([]);
  });

  it('идемпотентность: повторный install обновляет cap, не задваивая перехват', () => {
    const install = reserialize(installConsoleBuffer);
    const read = reserialize(readConsoleBuffer);

    install(50);
    install(10); // повторный — только обновляет cap
    console.error('once');

    // Одна запись, а не две (перехват не задвоился).
    expect(read()).toHaveLength(1);
  });

  it('кольцевой буфер соблюдает cap (старые записи вытесняются)', () => {
    const install = reserialize(installConsoleBuffer);
    const read = reserialize(readConsoleBuffer);

    install(2);
    console.error('a');
    console.error('b');
    console.error('c');

    const log = read();
    expect(log).toHaveLength(2);
    expect(log[0]?.text).toContain('b');
    expect(log[1]?.text).toContain('c');
  });
});

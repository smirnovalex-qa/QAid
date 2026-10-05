/**
 * Контракт самодостаточности MAIN-инъектируемых функций сборщика ДЕЙСТВИЙ (TASK-036,
 * ADR-0028) — зеркало `serialization.test.ts` для буфера консоли.
 *
 * Кольцевой буфер действий уходит в страницу через `executeScript({ world:'MAIN',
 * func })` — Chrome сериализует его как `func.toString()` БЕЗ замыкания модуля.
 * Здесь функции реконструируются через `reserialize` (`new Function`) в чистой
 * области — ровно как MAIN-world. Любая свободная ссылка на модуль (ключ стора,
 * инлайновый построитель селектора, хелпер) → `ReferenceError`, и тест краснеет.
 *
 * Дополнительно проверяем приватность: значения ввода маскируются, а `type=password`
 * не читается НИКОГДА (даже при выключенном маскировании).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reserialize } from '../../../../tests/support/reserialize';
import {
  clearActionsBuffer,
  installActionsBuffer,
  readActionsBuffer,
  setActionsPaused,
} from '../collectors/actions';

const STORE_KEY = '__qatbActions__';

function winStore(): unknown {
  return (window as unknown as Record<string, unknown>)[STORE_KEY];
}

const install = reserialize(installActionsBuffer);
const read = reserialize(readActionsBuffer);
const clear = reserialize(clearActionsBuffer);
const pause = reserialize(setActionsPaused);

afterEach(() => {
  reserialize(clearActionsBuffer)();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('MAIN-инъекция буфера действий: самодостаточность (reserialize)', () => {
  it('install через сериализацию ставит стор на window (нет утечки модуля)', () => {
    install(50, true);
    expect(winStore()).toBeDefined();
  });

  it('идемпотентность: повторный install не задваивает перехват, обновляет cap/mask', () => {
    install(50, true);
    install(10, true);
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'go');
    document.body.appendChild(btn);
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    const snap = read();
    expect(snap.events).toHaveLength(1); // не 2 — слушатель один
    expect(snap.events[0]).toMatchObject({ kind: 'click', target: '[data-testid=go]' });
  });

  it('click/input(masked)/submit/key(gesture) записываются; посимвольный ввод игнорируется', () => {
    install(50, true);

    const form = document.createElement('form');
    form.id = 'login';
    const email = document.createElement('input');
    email.type = 'email';
    email.id = 'email';
    email.value = 'user@example.test';
    form.appendChild(email);
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'submit');
    form.appendChild(btn);
    document.body.appendChild(form);

    btn.dispatchEvent(new Event('click', { bubbles: true }));
    email.dispatchEvent(new Event('input', { bubbles: true }));
    email.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); // игнор
    email.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); // жест
    form.dispatchEvent(new Event('submit', { bubbles: true }));

    const snap = read();
    const kinds = snap.events.map((e) => e.kind);
    expect(kinds).toEqual(['click', 'input', 'key', 'submit']);
    // Приватность: значение email замаскировано.
    const input = snap.events.find((e) => e.kind === 'input');
    expect(input?.field).toBe('email');
    expect(input?.detail).toBe('value hidden');
    // Якорь клоков присутствует.
    expect(typeof snap.anchor.perfNow).toBe('number');
    expect(typeof snap.anchor.wall).toBe('number');
  });

  it('password НЕ читается никогда — даже при выключенном маскировании', () => {
    install(50, false); // маскирование выключено
    const pwd = document.createElement('input');
    pwd.type = 'password';
    pwd.value = 'hunter2';
    document.body.appendChild(pwd);
    pwd.dispatchEvent(new Event('input', { bubbles: true }));

    const snap = read();
    const input = snap.events.find((e) => e.kind === 'input');
    expect(input?.field).toBe('password');
    expect(input?.detail).toBe('value hidden');
    expect(JSON.stringify(snap)).not.toContain('hunter2');
  });

  it('при выключенном маскировании обычные значения читаются (усечённо)', () => {
    install(50, false);
    const text = document.createElement('input');
    text.type = 'text';
    text.value = 'hello';
    document.body.appendChild(text);
    text.dispatchEvent(new Event('change', { bubbles: true }));
    const snap = read();
    expect(snap.events[0]?.detail).toBe('value: "hello"');
  });

  it('пауза останавливает запись; снятие паузы возобновляет', () => {
    install(50, true);
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    pause(true);
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(read().events).toHaveLength(0);

    pause(false);
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(read().events).toHaveLength(1);
  });

  it('кольцевой буфер соблюдает cap (старые записи вытесняются)', () => {
    install(2, true);
    const btn = document.createElement('button');
    btn.id = 'b';
    document.body.appendChild(btn);
    for (let i = 0; i < 3; i++) btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(read().events).toHaveLength(2);
  });

  it('Stop (keepLog) сохраняет лог читаемым и отцепляет слушатели; полный clear забывает буфер', () => {
    install(50, true);
    const btn = document.createElement('button');
    btn.id = 'b';
    document.body.appendChild(btn);
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(read().events).toHaveLength(1);

    // Stop с сохранением: буфер остаётся читаемым (Capture после Stop включит шаги)…
    clear(true);
    expect(winStore()).toBeDefined();
    expect(read().events).toHaveLength(1);
    // …но слушатели сняты — новые действия не пишутся.
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(read().events).toHaveLength(1);

    // Полный сброс — буфер забыт.
    clear(false);
    expect(winStore()).toBeUndefined();
    expect(read().events).toEqual([]);
  });

  it('SPA-навигация: pushState/hashchange/popstate дают navigation-события; clear восстанавливает', () => {
    const origPush = history.pushState;
    install(50, true);
    expect(history.pushState).not.toBe(origPush); // обёрнут

    history.pushState({}, '', '#/next');
    window.dispatchEvent(new Event('hashchange'));
    window.dispatchEvent(new Event('popstate'));

    const navs = read().events.filter((e) => e.kind === 'navigation');
    expect(navs.length).toBeGreaterThanOrEqual(3);

    clear();
    expect(winStore()).toBeUndefined();
    expect(history.pushState).toBe(origPush); // восстановлен
    expect(read().events).toEqual([]);
  });

  it('resize записывается с дебаунсом', () => {
    vi.useFakeTimers();
    install(50, true);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(read().events).toHaveLength(0); // ещё не сработал дебаунс
    vi.advanceTimersByTime(300);
    const evs = read().events;
    expect(evs).toHaveLength(1);
    expect(evs[0]?.kind).toBe('resize');
  });
});

/**
 * Тесты I/O-оркестрации горячей замены (session-profiles, TASK-047).
 *
 * Без Chrome/шины: `send` и `reload` инжектятся моками. Проверяем композицию read-RPC,
 * толерантность к сбоям областей, порядок операций (удаления → записи → reload),
 * пропуск cookies при withCookies=false, пропуск reload и учёт частичных сбоев.
 */
import { describe, expect, it, vi } from 'vitest';
import type { sendMessage } from '@/shared/messaging/bus';
import { ok, err } from '@/shared/result';
import { appError } from '@/shared/errors';
import { buildSwapPlan } from '../logic';
import { applySwapPlan, captureCurrentSnapshot } from '../swap';
import { authCookie, guestProfile, snapshot } from './fixtures/profiles';

/** Успешный ответ RPC по типу сообщения (форма как у реальных контрактов TASK-017). */
function okResponseFor(type: string): unknown {
  switch (type) {
    case 'storage/list':
      return ok({ items: [], origin: 'https://example.com' });
    case 'cookies/list':
      return ok({ cookies: [], domain: 'example.com' });
    case 'storage/set':
    case 'storage/remove':
      return ok({ ok: true });
    case 'cookies/set':
    case 'cookies/remove':
      return ok({ ok: true });
    default:
      return ok({});
  }
}

/**
 * Мок `send`: по умолчанию успех для каждого типа; `overrides(type, payload)` может
 * вернуть иной Result (или undefined, чтобы упасть на дефолт). Каст к `typeof
 * sendMessage` — реальная сигнатура дженерик-типизирована по реестру контрактов.
 */
function makeSend(
  overrides?: (type: string, payload: unknown) => unknown,
): ReturnType<typeof vi.fn> {
  return vi.fn((type: string, payload: unknown) => {
    const custom = overrides?.(type, payload);
    return Promise.resolve(custom ?? okResponseFor(type));
  });
}

const asSend = (fn: ReturnType<typeof vi.fn>): typeof sendMessage => fn;

describe('captureCurrentSnapshot', () => {
  it('композирует storage/list local+session+cookies/list и мёржит снимок', async () => {
    const send = makeSend((type) => {
      if (type === 'storage/list') {
        // Разные значения для local/session нам не важны — вернём непустой набор.
        return ok({ items: [{ key: 'k', value: 'v' }], origin: 'https://example.com' });
      }
      if (type === 'cookies/list') {
        return ok({ cookies: [authCookie], domain: 'example.com' });
      }
      return undefined;
    });

    const snap = await captureCurrentSnapshot(1, { withCookies: true }, { send: asSend(send) });

    const types = send.mock.calls.map((c) => c[0] as string);
    expect(types).toEqual(['storage/list', 'storage/list', 'cookies/list']);
    expect(snap.cookies).toEqual([authCookie]);
    expect(snap.local).toEqual([{ key: 'k', value: 'v' }]);
    expect(snap.session).toEqual([{ key: 'k', value: 'v' }]);
  });

  it('при withCookies=false не зовёт cookies/list и отдаёт пустые cookies', async () => {
    const send = makeSend();

    const snap = await captureCurrentSnapshot(1, { withCookies: false }, { send: asSend(send) });

    const types = send.mock.calls.map((c) => c[0] as string);
    expect(types).toEqual(['storage/list', 'storage/list']);
    expect(types).not.toContain('cookies/list');
    expect(snap.cookies).toEqual([]);
  });

  it('толерантен к сбойной области: {ok:false} → пустой массив, без throw', async () => {
    const send = makeSend((type, payload) => {
      if (type === 'storage/list' && (payload as { area: string }).area === 'local') {
        return err(appError('INTERNAL', 'boom'));
      }
      if (type === 'storage/list') {
        return ok({ items: [{ key: 's', value: '1' }], origin: 'https://example.com' });
      }
      return undefined;
    });

    const snap = await captureCurrentSnapshot(1, { withCookies: true }, { send: asSend(send) });

    expect(snap.local).toEqual([]);
    expect(snap.session).toEqual([{ key: 's', value: '1' }]);
  });
});

describe('applySwapPlan', () => {
  // current = admin snapshot, target = guest snapshot → в replace будут и удаления, и записи.
  const plan = buildSwapPlan(snapshot, guestProfile.snapshot, 'replace');

  it('replace: удаления идут ДО записей, reload — последним; отчёт считает верно', async () => {
    const send = makeSend();
    const reload = vi.fn((): Promise<void> => Promise.resolve());

    const res = await applySwapPlan(
      1,
      plan,
      { withCookies: true, reload: true },
      { send: asSend(send), reload },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    // predicted: applied=2 (cookie guest + local theme), removed=3 (sid, lang, wizardStep).
    expect(res.value).toEqual({ applied: 2, removed: 3, failed: 0 });

    const types = send.mock.calls.map((c) => c[0] as string);
    // Порядок: cookieRemoves → local.removes → session.removes → cookieSets → local.sets.
    expect(types).toEqual([
      'cookies/remove',
      'storage/remove',
      'storage/remove',
      'cookies/set',
      'storage/set',
    ]);

    // Все удаления раньше всех записей.
    const isRemove = (t: string): boolean => t.endsWith('/remove');
    const isSet = (t: string): boolean => t.endsWith('/set');
    const lastRemove = types.map(isRemove).lastIndexOf(true);
    const firstSet = types.findIndex(isSet);
    expect(lastRemove).toBeLessThan(firstSet);

    // reload — строго после всех send-вызовов.
    const lastSend = Math.max(...send.mock.invocationCallOrder);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.invocationCallOrder[0]).toBeGreaterThan(lastSend);
  });

  it('withCookies=false: не зовёт ни один cookies/* RPC', async () => {
    const send = makeSend();
    const reload = vi.fn((): Promise<void> => Promise.resolve());

    await applySwapPlan(
      1,
      plan,
      { withCookies: false, reload: true },
      { send: asSend(send), reload },
    );

    const types = send.mock.calls.map((c) => c[0] as string);
    expect(types.some((t) => t.startsWith('cookies/'))).toBe(false);
  });

  it('reload=false: reload не вызывается', async () => {
    const send = makeSend();
    const reload = vi.fn((): Promise<void> => Promise.resolve());

    await applySwapPlan(
      1,
      plan,
      { withCookies: true, reload: false },
      { send: asSend(send), reload },
    );

    expect(reload).not.toHaveBeenCalled();
  });

  it('частичный сбой: один set вернул {ok:false} → в failed, остальное применено', async () => {
    const send = makeSend((type, payload) => {
      if (type === 'storage/set' && (payload as { area: string }).area === 'local') {
        return err(appError('INTERNAL', 'set failed'));
      }
      return undefined;
    });
    const reload = vi.fn((): Promise<void> => Promise.resolve());

    const res = await applySwapPlan(
      1,
      plan,
      { withCookies: true, reload: true },
      { send: asSend(send), reload },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    // local.set (theme) провалился: applied 2→1, failed 0→1, removed без изменений.
    expect(res.value).toEqual({ applied: 1, removed: 3, failed: 1 });
  });

  it('reload бросил → err с кодом INTERNAL', async () => {
    const send = makeSend();
    const reload = vi.fn((): Promise<void> => {
      throw new Error('reload boom');
    });

    const res = await applySwapPlan(
      1,
      plan,
      { withCookies: true, reload: true },
      { send: asSend(send), reload },
    );

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected err');
    expect(res.error.code).toBe('INTERNAL');
  });
});

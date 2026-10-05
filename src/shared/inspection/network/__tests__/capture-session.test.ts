/**
 * Юнит-тесты разделяемой ref-count сессии перехвата сети. Платформа (инъекция/снятие/
 * чтение) и события вкладок инъектируются фейками — Chrome не нужен (ADR-0014). Проверяем
 * инварианты, ради которых сессия и появилась: объединение правил потребителей, teardown
 * только при нуле потребителей (нет взаимного убийства), ре-инъекция при навигации.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNetworkCaptureSession } from '../capture-session';
import type { CaptureTabEvents, NetworkCaptureSession } from '../capture-session';

interface Rule {
  id: string;
}
interface Entry {
  url: string;
}

interface Harness {
  install: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  fireUpdated: (tabId: number, changeInfo: { status?: string }) => void;
  fireRemoved: (tabId: number) => void;
}

function makeSession(overrides?: {
  install?: (tabId: number, rules: Rule[], immediate: boolean) => Promise<void>;
}): { session: NetworkCaptureSession<Rule, Entry>; h: Harness } {
  const updated: ((tabId: number, ci: { status?: string }) => void)[] = [];
  const removed: ((tabId: number) => void)[] = [];
  const tabEvents: CaptureTabEvents = {
    onUpdated: { addListener: (cb) => updated.push(cb) },
    onRemoved: { addListener: (cb) => removed.push(cb) },
  };
  const install = vi.fn(overrides?.install ?? (() => Promise.resolve()));
  const clear = vi.fn(() => Promise.resolve());
  const read = vi.fn(() => Promise.resolve<Entry[]>([{ url: '/x' }]));
  const session = createNetworkCaptureSession<Rule, Entry>({ install, clear, read, tabEvents });
  return {
    session,
    h: {
      install,
      clear,
      read,
      fireUpdated: (tabId, ci) => {
        updated.forEach((cb) => {
          cb(tabId, ci);
        });
      },
      fireRemoved: (tabId) => {
        removed.forEach((cb) => {
          cb(tabId);
        });
      },
    },
  };
}

describe('createNetworkCaptureSession', () => {
  let session: NetworkCaptureSession<Rule, Entry>;
  let h: Harness;
  beforeEach(() => {
    ({ session, h } = makeSession());
  });

  it('acquire ставит перехватчик с правилами потребителя', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    expect(h.install).toHaveBeenCalledWith(1, [{ id: 'r1' }], false);
    expect(session.isActive(1)).toBe(true);
  });

  it('несколько потребителей → ОБЪЕДИНЁННЫЕ правила (наблюдатель добавляет пусто)', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    await session.acquire('observer', 1, []);
    expect(h.install).toHaveBeenLastCalledWith(1, [{ id: 'r1' }], false);
  });

  it('release не последнего потребителя — перехватчик ЖИВ, правила пересобираются', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    await session.acquire('observer', 1, []);
    h.install.mockClear();

    await session.release('mock', 1); // ушёл мок, остался наблюдатель
    expect(h.clear).not.toHaveBeenCalled(); // сессия НЕ убита
    expect(h.install).toHaveBeenCalledWith(1, [], false); // правила схлопнулись к пустым
    expect(session.isActive(1)).toBe(true);
  });

  it('release последнего потребителя — перехватчик снимается, вкладка забыта', async () => {
    await session.acquire('observer', 1, []);
    await session.release('observer', 1);
    expect(h.clear).toHaveBeenCalledWith(1);
    expect(session.isActive(1)).toBe(false);
  });

  it('release незарегистрированного потребителя — no-op', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    h.clear.mockClear();
    await session.release('observer', 1);
    expect(h.clear).not.toHaveBeenCalled();
    expect(session.isActive(1)).toBe(true);
  });

  it('навигация (status=loading) переинъектирует объединённые правила с immediate=true', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    h.install.mockClear();
    h.fireUpdated(1, { status: 'loading' });
    await Promise.resolve();
    expect(h.install).toHaveBeenCalledWith(1, [{ id: 'r1' }], true);
  });

  it('не-loading статус и вкладки без потребителей ре-инъекцию не вызывают', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    h.install.mockClear();
    h.fireUpdated(1, { status: 'complete' });
    h.fireUpdated(2, { status: 'loading' }); // на 2 никого нет
    await Promise.resolve();
    expect(h.install).not.toHaveBeenCalled();
  });

  it('закрытие вкладки забывает её (ре-инъекции после не будет)', async () => {
    await session.acquire('mock', 1, [{ id: 'r1' }]);
    h.fireRemoved(1);
    expect(session.isActive(1)).toBe(false);
    h.install.mockClear();
    h.fireUpdated(1, { status: 'loading' });
    await Promise.resolve();
    expect(h.install).not.toHaveBeenCalled();
  });

  it('read делегирует в deps.read', async () => {
    await expect(session.read(1)).resolves.toEqual([{ url: '/x' }]);
    expect(h.read).toHaveBeenCalledWith(1);
  });

  it('сбой install откатывает регистрацию нового потребителя (вкладка не осиротела)', async () => {
    const failing = makeSession({ install: () => Promise.reject(new Error('inject-failed')) });
    const res = await failing.session.acquire('mock', 1, [{ id: 'r1' }]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('install-failed');
    expect(failing.session.isActive(1)).toBe(false);
  });
});

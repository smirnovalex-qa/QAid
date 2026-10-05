/**
 * Юнит-тесты брокера прав (TASK-013). Платформенный `chrome.permissions`
 * инъектируется seam'ом `BrowserPermissions` — Chrome не нужен (ADR-0014).
 */
import { describe, expect, it, vi } from 'vitest';
import { createPermissionBroker } from '@/shared/permissions';
import type { BrowserPermissions } from '@/shared/permissions';

interface Listeners {
  added: (() => void)[];
  removed: (() => void)[];
}

function makeSeam(overrides?: Partial<BrowserPermissions>): {
  seam: BrowserPermissions;
  listeners: Listeners;
  request: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
} {
  const listeners: Listeners = { added: [], removed: [] };
  const request = vi.fn(() => Promise.resolve(true));
  const contains = vi.fn(() => Promise.resolve(true));
  const seam: BrowserPermissions = {
    request,
    contains,
    onAdded: {
      addListener: (cb) => listeners.added.push(cb),
      removeListener: () => undefined,
    },
    onRemoved: {
      addListener: (cb) => listeners.removed.push(cb),
      removeListener: () => undefined,
    },
    ...overrides,
  };
  return { seam, listeners, request, contains };
}

describe('createPermissionBroker', () => {
  it('ensure() вызывает request с нормализованным spec и резолвит его результат', async () => {
    const { seam, request } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    const granted = await broker.ensure({ optional: ['scripting'], host: ['https://a.example/*'] });

    expect(granted).toBe(true);
    expect(request).toHaveBeenCalledWith({
      permissions: ['scripting'],
      origins: ['https://a.example/*'],
    });
  });

  it('has() использует contains, а не request', async () => {
    const { seam, request, contains } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    const has = await broker.has({ optional: ['activeTab'] });

    expect(has).toBe(true);
    expect(contains).toHaveBeenCalledWith({ permissions: ['activeTab'] });
    expect(request).not.toHaveBeenCalled();
  });

  it('пустой запрос нормализуется в пустой spec (без permissions/origins)', async () => {
    const { seam, contains } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.has({});

    expect(contains).toHaveBeenCalledWith({});
  });

  it('has() кэширует результат contains до инвалидации', async () => {
    const { seam, contains } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.has({ optional: ['scripting'] });
    await broker.has({ optional: ['scripting'] });

    expect(contains).toHaveBeenCalledTimes(1);
  });

  it('кэш инвалидируется на onRemoved — следующий has() снова спрашивает', async () => {
    const { seam, contains, listeners } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.has({ optional: ['scripting'] });
    for (const cb of listeners.removed) cb();
    await broker.has({ optional: ['scripting'] });

    expect(contains).toHaveBeenCalledTimes(2);
  });

  it('кэш инвалидируется на onAdded', async () => {
    const { seam, contains, listeners } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.has({ optional: ['scripting'] });
    for (const cb of listeners.added) cb();
    await broker.has({ optional: ['scripting'] });

    expect(contains).toHaveBeenCalledTimes(2);
  });

  it('ключ кэша не зависит от порядка прав', async () => {
    const { seam, contains } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.has({ optional: ['a', 'b'] });
    await broker.has({ optional: ['b', 'a'] });

    expect(contains).toHaveBeenCalledTimes(1);
  });

  it('отказ (request → false) резолвится false без исключений', async () => {
    const seam = makeSeam({ request: vi.fn(() => Promise.resolve(false)) }).seam;
    const broker = createPermissionBroker({ permissions: seam });

    await expect(broker.ensure({ optional: ['scripting'] })).resolves.toBe(false);
  });

  it('исключение request() при реально отсутствующем праве гасится в false', async () => {
    const seam = makeSeam({
      request: vi.fn(() => Promise.reject(new Error('no gesture'))),
      contains: vi.fn(() => Promise.resolve(false)),
    }).seam;
    const broker = createPermissionBroker({ permissions: seam });

    await expect(broker.ensure({ optional: ['scripting'] })).resolves.toBe(false);
  });

  it('gesture-отказ request() деградирует к contains(): уже выданное право → true', async () => {
    // Регресс TASK-036: в side panel `request()` для УЖЕ выданного права падает
    // «must be called during a user gesture». Фича не должна ложно считать право
    // отсутствующим — `contains()` (жест не нужен) подтверждает, что оно есть.
    const request = vi.fn(() => Promise.reject(new Error('must be called during a user gesture')));
    const contains = vi.fn(() => Promise.resolve(true));
    const broker = createPermissionBroker({ permissions: makeSeam({ request, contains }).seam });

    await expect(broker.ensure({ optional: ['scripting'] })).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({ permissions: ['scripting'] });
  });

  it('повторный ensure() не дёргает request() — берёт право из кэша (жест не нужен)', async () => {
    // Регресс TASK-036: первый grant проходит под жестом; последующие действия фичи
    // не должны повторно вызывать request() (иначе — gesture-ошибка на уже выданном праве).
    const { seam, request } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.ensure({ optional: ['scripting'] });
    await broker.ensure({ optional: ['scripting'] });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('has()==true до ensure() → ensure() не вызывает request()', async () => {
    const { seam, request } = makeSeam(); // contains → true по умолчанию
    const broker = createPermissionBroker({ permissions: seam });

    await broker.has({ optional: ['scripting'] }); // кэширует true
    await broker.ensure({ optional: ['scripting'] });

    expect(request).not.toHaveBeenCalled();
  });

  it('исключение платформы в has() гасится в false', async () => {
    const seam = makeSeam({ contains: vi.fn(() => Promise.reject(new Error('boom'))) }).seam;
    const broker = createPermissionBroker({ permissions: seam });

    await expect(broker.has({ optional: ['scripting'] })).resolves.toBe(false);
  });

  it('ensure() обновляет кэш — последующий has() не спрашивает', async () => {
    const { seam, contains } = makeSeam();
    const broker = createPermissionBroker({ permissions: seam });

    await broker.ensure({ optional: ['scripting'] });
    const has = await broker.has({ optional: ['scripting'] });

    expect(has).toBe(true);
    expect(contains).not.toHaveBeenCalled();
  });

  it('без deps использует платформенный seam поверх chrome.permissions (мок)', async () => {
    // Дефолтный путь (`defaultBrowserPermissions`) — мок отдаёт true на request/contains.
    const broker = createPermissionBroker();

    await expect(broker.ensure({ optional: ['scripting'] })).resolves.toBe(true);
    await expect(broker.has({ optional: ['activeTab'] })).resolves.toBe(true);
  });
});

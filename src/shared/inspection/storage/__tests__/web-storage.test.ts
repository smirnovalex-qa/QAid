import { beforeEach, describe, expect, it } from 'vitest';
import { storageHandlers } from '@/shared/inspection/storage/web-storage';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('web-storage content handlers', () => {
  it('lists local storage entries with the page origin', async () => {
    window.localStorage.setItem('a', '1');
    window.localStorage.setItem('b', '2');
    const res = await storageHandlers.list({ tabId: 1, area: 'local' });
    expect(res.origin).toBe(window.location.origin);
    expect(res.items).toEqual(
      expect.arrayContaining([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]),
    );
  });

  it('reads session storage separately from local', async () => {
    window.sessionStorage.setItem('s', 'v');
    const local = await storageHandlers.list({ tabId: 1, area: 'local' });
    const session = await storageHandlers.list({ tabId: 1, area: 'session' });
    expect(local.items).toHaveLength(0);
    expect(session.items).toEqual([{ key: 's', value: 'v' }]);
  });

  it('sets a value', async () => {
    const res = await storageHandlers.set({ tabId: 1, area: 'local', key: 'k', value: 'v' });
    expect(res).toEqual({ ok: true });
    expect(window.localStorage.getItem('k')).toBe('v');
  });

  it('removes a key', async () => {
    window.sessionStorage.setItem('k', 'v');
    const res = await storageHandlers.remove({ tabId: 1, area: 'session', key: 'k' });
    expect(res).toEqual({ ok: true });
    expect(window.sessionStorage.getItem('k')).toBeNull();
  });

  it('clears an area and reports the count removed', async () => {
    window.localStorage.setItem('a', '1');
    window.localStorage.setItem('b', '2');
    const res = await storageHandlers.clear({ tabId: 1, area: 'local' });
    expect(res).toEqual({ removed: 2 });
    expect(window.localStorage.length).toBe(0);
  });
});

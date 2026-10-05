import { afterEach, describe, expect, it } from 'vitest';
import { startPicker } from '@/content/inspection/picker';

afterEach(() => {
  document.documentElement.style.cursor = '';
  document.body.innerHTML = '';
});

describe('startPicker', () => {
  it('resolves with the clicked element and prevents the click', async () => {
    const el = document.createElement('button');
    document.body.appendChild(el);

    const pending = startPicker();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);

    await expect(pending).resolves.toBe(el);
    expect(event.defaultPrevented).toBe(true);
  });

  it('resolves null on Escape', async () => {
    const pending = startPicker();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(pending).resolves.toBeNull();
  });

  it('calls onHover with the hovered target', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const seen: Element[] = [];

    const pending = startPicker({ onHover: (hovered) => seen.push(hovered) });
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(seen).toContain(el);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await pending;
  });

  it('ignores hover over the overlay host', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-qatb-overlay', '');
    document.body.appendChild(host);
    const seen: Element[] = [];

    const pending = startPicker({ onHover: (hovered) => seen.push(hovered) });
    host.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(seen).toHaveLength(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await pending;
  });

  it('sets crosshair cursor while active and restores it afterwards', async () => {
    document.documentElement.style.cursor = 'pointer';

    const pending = startPicker();
    expect(document.documentElement.style.cursor).toBe('crosshair');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await pending;
    expect(document.documentElement.style.cursor).toBe('pointer');
  });

  it('resolves only once (Escape after a click is ignored)', async () => {
    const el = document.createElement('a');
    document.body.appendChild(el);

    const pending = startPicker();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(pending).resolves.toBe(el);
  });

  it('abort через signal резолвит null, снимает слушатели и восстанавливает курсор', async () => {
    document.documentElement.style.cursor = 'pointer';
    const el = document.createElement('button');
    document.body.appendChild(el);
    const controller = new AbortController();

    const pending = startPicker({ signal: controller.signal });
    expect(document.documentElement.style.cursor).toBe('crosshair');

    controller.abort();
    await expect(pending).resolves.toBeNull();
    expect(document.documentElement.style.cursor).toBe('pointer');

    // Слушатели сняты: последующий клик уже не перехватывается (не preventDefault).
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('уже отменённый signal резолвит null не вешая слушатели', async () => {
    const controller = new AbortController();
    controller.abort();
    document.documentElement.style.cursor = 'text';

    await expect(startPicker({ signal: controller.signal })).resolves.toBeNull();
    // Курсор не трогали (пикер не стартовал).
    expect(document.documentElement.style.cursor).toBe('text');
  });
});

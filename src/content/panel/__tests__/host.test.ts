import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPanelHost } from '@/content/panel/host';
import { PANEL_HOST_ATTR } from '@/content/panel/frame';
import { encodePanelMessage } from '@/shared/panel/protocol';
import { defineFeatureSettings } from '@/shared/storage/settings';
import { createMemoryArea } from '@/shared/storage/storage-area';
import { buildKey } from '@/shared/storage/keys';
import { CURRENT_SCHEMA_VERSION } from '@/shared/storage/schema';
import {
  FLOATING_PANEL_DEFAULTS,
  floatingPanelSchema,
  type FloatingPanelState,
} from '@/shared/panel/settings';

const NONCE = 'test-nonce';
const KEY = buildKey(CURRENT_SCHEMA_VERSION, 'floating-panel', 'settings');
const getURL = (p: string): string => `chrome-extension://abc/${p}`;

function memorySettings(seed?: Record<string, unknown>) {
  const area = createMemoryArea(seed);
  return defineFeatureSettings<FloatingPanelState>(
    { namespace: 'floating-panel', schema: floatingPanelSchema, defaults: FLOATING_PANEL_DEFAULTS },
    area,
  );
}

function hostCount(): number {
  return document.querySelectorAll(`[${PANEL_HOST_ATTR}]`).length;
}
function hostEl(): HTMLElement | null {
  return document.querySelector(`[${PANEL_HOST_ATTR}]`);
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  for (const node of Array.from(document.querySelectorAll(`[${PANEL_HOST_ATTR}]`))) node.remove();
  vi.useRealTimers();
});

describe('installPanelHost', () => {
  it('монтирует ровно один хост панели и позиционирует его по умолчанию (правый верх)', async () => {
    const settings = memorySettings();
    installPanelHost({ settings, getURL, nonce: NONCE });
    await tick();

    expect(hostCount()).toBe(1);
    // innerWidth jsdom=1024, width=380, margin=16 → x=628, y=16.
    expect(hostEl()?.style.transform).toBe('translate3d(628px, 16px, 0)');
  });

  it('восстанавливает сохранённую позицию (клампленную во вьюпорт)', async () => {
    const settings = memorySettings({
      [KEY]: { x: 120, y: 48, collapsed: false, width: 400 },
    });
    installPanelHost({ settings, getURL, nonce: NONCE });
    await tick();
    expect(hostEl()?.style.transform).toBe('translate3d(120px, 48px, 0)');
  });

  it('closed-shadow хост: содержимое недоступно со страницы (shadowRoot === null)', async () => {
    installPanelHost({ settings: memorySettings(), getURL, nonce: NONCE });
    await tick();
    expect(hostEl()?.shadowRoot).toBeNull();
  });

  it('close-сообщение с верным nonce снимает панель и зовёт onDestroy', async () => {
    const onDestroy = vi.fn();
    installPanelHost({ settings: memorySettings(), getURL, nonce: NONCE, onDestroy });
    await tick();
    expect(hostCount()).toBe(1);

    window.dispatchEvent(
      new MessageEvent('message', { data: encodePanelMessage(NONCE, { type: 'close' }) }),
    );
    expect(hostCount()).toBe(0);
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it('сообщение с чужим nonce игнорируется (панель остаётся)', async () => {
    installPanelHost({ settings: memorySettings(), getURL, nonce: NONCE });
    await tick();
    window.dispatchEvent(
      new MessageEvent('message', { data: encodePanelMessage('attacker', { type: 'close' }) }),
    );
    expect(hostCount()).toBe(1);
  });

  it('collapse-сообщение персистит свёрнутость', async () => {
    const settings = memorySettings();
    installPanelHost({ settings, getURL, nonce: NONCE });
    await tick();

    window.dispatchEvent(
      new MessageEvent('message', { data: encodePanelMessage(NONCE, { type: 'collapse' }) }),
    );
    await tick();
    expect((await settings.get()).collapsed).toBe(true);
  });

  it('resize-сообщение клампит и персистит ширину', async () => {
    const settings = memorySettings();
    installPanelHost({ settings, getURL, nonce: NONCE });
    await tick();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: encodePanelMessage(NONCE, { type: 'resize', width: 99999 }),
      }),
    );
    await tick();
    expect((await settings.get()).width).toBe(720); // PANEL_MAX_WIDTH
  });

  it('teardown снимает панель и слушатели (повторные сообщения — no-op, идемпотентно)', async () => {
    const onDestroy = vi.fn();
    const host = installPanelHost({ settings: memorySettings(), getURL, nonce: NONCE, onDestroy });
    await tick();
    host.teardown();
    expect(hostCount()).toBe(0);
    host.teardown(); // идемпотентно
    expect(onDestroy).toHaveBeenCalledTimes(1);
    // Слушатель снят — сообщение после teardown ничего не делает.
    window.dispatchEvent(
      new MessageEvent('message', { data: encodePanelMessage(NONCE, { type: 'close' }) }),
    );
    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it('reclamp на resize вьюпорта удерживает панель в допустимой зоне', async () => {
    const settings = memorySettings({ [KEY]: { x: 900, y: 700, collapsed: false, width: 380 } });
    installPanelHost({ settings, getURL, nonce: NONCE });
    await tick();
    // Ужимаем вьюпорт — панель должна «подъехать» в видимую зону.
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    window.dispatchEvent(new Event('resize'));
    const t = hostEl()?.style.transform ?? '';
    const m = /translate3d\((-?\d+)px, (-?\d+)px/.exec(t);
    expect(m).not.toBeNull();
    const x = Number(m?.[1]);
    const y = Number(m?.[2]);
    expect(x).toBeLessThanOrEqual(500 - 48);
    expect(y).toBeLessThanOrEqual(400 - 40);
  });

  it('ready-timeout рисует CSP-фолбэк (не оставляет битую панель без сообщения)', () => {
    vi.useFakeTimers();
    installPanelHost({ settings: memorySettings(), getURL, nonce: NONCE });
    // Без `ready` от iframe по истечении дедлайна показывается фолбэк; хост остаётся
    // (заголовок перетаскиваем/закрываем), а не висит пустым.
    vi.advanceTimersByTime(4000);
    expect(hostCount()).toBe(1);
  });
});

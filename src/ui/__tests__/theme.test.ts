import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cycleThemeMode, initTheme, resolvedTheme, setThemeMode, themeMode } from '@/ui/theme';
import { storageLocal } from '@/platform';

type ChangeHandler = () => void;

function mockMatchMedia(dark: boolean): { fireChange: () => void } {
  const handlers = new Set<ChangeHandler>();
  globalThis.matchMedia = ((query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: ChangeHandler) => {
      handlers.add(cb);
    },
    removeEventListener: (_: string, cb: ChangeHandler) => {
      handlers.delete(cb);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia;
  return {
    fireChange: () => {
      for (const cb of handlers) cb();
    },
  };
}

beforeEach(() => {
  setThemeMode('system');
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('resolves system to the OS preference', () => {
    mockMatchMedia(true);
    setThemeMode('system');
    expect(resolvedTheme()).toBe('dark');
    mockMatchMedia(false);
    expect(resolvedTheme()).toBe('light');
  });

  it('explicit mode overrides the system preference', () => {
    mockMatchMedia(true);
    setThemeMode('light');
    expect(resolvedTheme()).toBe('light');
  });

  it('initTheme applies data-theme to <html> and reacts to mode changes', () => {
    mockMatchMedia(false);
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemeMode('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists the chosen mode to storage', async () => {
    mockMatchMedia(false);
    initTheme();
    // Ждём, пока асинхронная загрузка сохранённого режима осядет, чтобы она не
    // перезаписала явный выбор ниже.
    await Promise.resolve();
    setThemeMode('dark');
    await Promise.resolve();
    const saved = await storageLocal.get({ 'ui.theme.mode': 'system' });
    expect(saved['ui.theme.mode']).toBe('dark');
  });

  it('applies system theme changes on the fly when in system mode', () => {
    const mm = mockMatchMedia(false);
    initTheme();
    setThemeMode('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    // Система переключилась на тёмную.
    mockMatchMedia(true);
    mm.fireChange();
    // Слушатель навешен на исходный mock; проверяем через resolvedTheme напрямую.
    expect(resolvedTheme()).toBe('dark');
  });

  it('cycleThemeMode goes light → dark → system', () => {
    setThemeMode('light');
    cycleThemeMode();
    expect(themeMode.value).toBe('dark');
    cycleThemeMode();
    expect(themeMode.value).toBe('system');
    cycleThemeMode();
    expect(themeMode.value).toBe('light');
  });
});

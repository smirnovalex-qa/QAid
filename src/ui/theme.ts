/**
 * Управление темой: сигнал режима + разрешение эффективной темы, применение к
 * `<html data-theme>`, персист в `chrome.storage.local` (через адаптер платформы)
 * и реакция на смену системной темы.
 *
 * Персист сейчас идёт через тонкий `storageLocal`; TASK-005 переведёт его на
 * версионируемый storage-слой без изменения этого API.
 */
import { effect, signal } from '@preact/signals';
import { storageLocal } from '@/platform';
import { logger } from '@/shared/logger';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'ui.theme.mode';

export const themeMode = signal<ThemeMode>('system');

function systemPrefersDark(): boolean {
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolvedTheme(): ResolvedTheme {
  if (themeMode.value !== 'system') return themeMode.value;
  return systemPrefersDark() ? 'dark' : 'light';
}

function apply(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode;
}

/** Циклический переключатель для кнопки в хедере: light → dark → system → light. */
export function cycleThemeMode(): void {
  const order: ThemeMode[] = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(themeMode.value) + 1) % order.length];
  themeMode.value = next ?? 'system';
}

let systemListenerAttached = false;

export function initTheme(): void {
  void storageLocal
    .get({ [STORAGE_KEY]: 'system' })
    .then((saved) => {
      const mode = saved[STORAGE_KEY];
      if (mode === 'light' || mode === 'dark' || mode === 'system') themeMode.value = mode;
    })
    .catch((e: unknown) => {
      logger.error('theme: load', e);
    });

  // Применяем тему и персистим режим при каждом его изменении.
  effect(() => {
    apply(resolvedTheme());
    void storageLocal.set({ [STORAGE_KEY]: themeMode.value }).catch((e: unknown) => {
      logger.error('theme: save', e);
    });
  });

  if (!systemListenerAttached) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode.value === 'system') apply(resolvedTheme());
    });
    systemListenerAttached = true;
  }
}

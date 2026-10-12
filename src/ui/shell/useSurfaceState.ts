/**
 * Состояние единой поверхности — v3 (модель Home → Tool). Обе поверхности (side
 * panel / popup) используют одну и ту же адаптивную поверхность. Навигация
 * (view/tool), поиск по каталогу, закрепления (pins), ⌘K-палитра.
 *
 * Персист — через `storageLocal` (версионируемый слой над chrome.storage.local,
 * TASK-005): закрепления глобальны (общие для поверхностей), навигация — на
 * поверхность. Тема живёт в `ui/theme`, язык — в `i18n`.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { storageLocal } from '@/platform';
import { setLocale, type Locale } from '@/i18n';
import { logger } from '@/shared/logger';
import { resolvedTheme, setThemeMode, type ThemeMode } from '@/ui/theme';
import { DEFAULT_PINS, TOOLS } from './taxonomy';

const KEY_PINS = 'ui.surface.pins';
const KEY_LOCALE = 'ui.locale';
const keyTool = (surface: string): string => `ui.surface.tool.${surface}`;
const keyView = (surface: string): string => `ui.surface.view.${surface}`;

export type View = 'home' | 'tool' | 'settings';

const VALID_TOOL = new Set(TOOLS.map((t) => t.id));

export interface SurfaceState {
  view: View;
  /** Активный инструмент (featureId) в tool-view. */
  tool: string;
  /** Строка поиска домашнего экрана. */
  q: string;
  setQ: (q: string) => void;
  /** ⌘K-палитра (внутри инструмента). */
  palOpen: boolean;
  setPalOpen: (open: boolean) => void;

  open: (id: string) => void;
  goHome: () => void;
  goSettings: () => void;

  pins: string[];
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;

  setLocalePersisted: (next: Locale) => void;
  setThemePersisted: (next: ThemeMode) => void;
}

/**
 * Подготавливает навигацию целевой поверхности (write-before-open): поверхность
 * гидратируется из своих ключей один раз при монтировании, поэтому перед её открытием
 * (popup → side panel) записываем туда нужные view/tool. Невалидный `tool` игнорируется —
 * пишется только view. Ошибки хранилища пробрасываются вызывающему.
 */
export async function stageSurfaceNavigation(
  surface: 'popup' | 'sidepanel' | 'panel',
  view: View,
  tool?: string,
): Promise<void> {
  const items: Record<string, unknown> = { [keyView(surface)]: view };
  if (tool !== undefined && VALID_TOOL.has(tool)) items[keyTool(surface)] = tool;
  await storageLocal.set(items);
}

export function useSurfaceState(surface: 'popup' | 'sidepanel' | 'panel'): SurfaceState {
  const [view, setView] = useState<View>('home');
  const [tool, setTool] = useState<string>('');
  const [q, setQ] = useState('');
  const [palOpen, setPalOpen] = useState(false);
  const [pins, setPins] = useState<string[]>([...DEFAULT_PINS]);

  const hydrated = useRef(false);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const viewRef = useRef(view);
  viewRef.current = view;
  const palRef = useRef(palOpen);
  palRef.current = palOpen;

  // Гидратация из хранилища (однократно).
  useEffect(() => {
    void storageLocal
      .get({
        [KEY_PINS]: null as string[] | null,
        [KEY_LOCALE]: '',
        [keyTool(surface)]: '',
        [keyView(surface)]: '',
      })
      .then((saved) => {
        const savedPins = saved[KEY_PINS];
        if (Array.isArray(savedPins)) setPins(savedPins.filter((id) => VALID_TOOL.has(id)));
        const loc = saved[KEY_LOCALE];
        if (loc === 'ru' || loc === 'en') setLocale(loc);
        const savedTool = saved[keyTool(surface)];
        const savedView = saved[keyView(surface)];
        if (savedView === 'settings') {
          setView('settings');
        } else if (
          savedView === 'tool' &&
          typeof savedTool === 'string' &&
          VALID_TOOL.has(savedTool)
        ) {
          setTool(savedTool);
          setView('tool');
        }
      })
      .catch((e: unknown) => {
        logger.error('surface: load prefs', e);
      })
      .finally(() => {
        hydrated.current = true;
      });
  }, [surface]);

  const persist = useCallback((items: Record<string, unknown>): void => {
    if (!hydrated.current) return;
    void storageLocal.set(items).catch((e: unknown) => {
      logger.error('surface: save prefs', e);
    });
  }, []);

  const open = useCallback(
    (id: string): void => {
      if (!VALID_TOOL.has(id)) return;
      setTool(id);
      setView('tool');
      setPalOpen(false);
      setQ('');
      persist({ [keyTool(surface)]: id, [keyView(surface)]: 'tool' });
    },
    [persist, surface],
  );

  const goHome = useCallback((): void => {
    setView('home');
    setPalOpen(false);
    setQ('');
    persist({ [keyView(surface)]: 'home' });
  }, [persist, surface]);

  const goSettings = useCallback((): void => {
    setView('settings');
    setPalOpen(false);
    persist({ [keyView(surface)]: 'settings' });
  }, [persist, surface]);

  const isPinned = useCallback((id: string): boolean => pins.includes(id), [pins]);

  const togglePin = useCallback(
    (id: string): void => {
      setPins((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        persist({ [KEY_PINS]: next });
        return next;
      });
    },
    [persist],
  );

  // Глобальные клавиши: ⌘K (поиск/палитра), Esc (закрыть/назад), Alt+1–4 (pins).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (viewRef.current === 'home') {
          const el = document.getElementById('qatb-home-search');
          if (el)
            setTimeout(() => {
              el.focus();
            }, 0);
        } else {
          setPalOpen((p) => !p);
        }
      } else if (e.key === 'Escape') {
        if (palRef.current) {
          setPalOpen(false);
        } else if (viewRef.current !== 'home') {
          goHome();
        }
      } else if (e.altKey && e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1;
        const id = pinsRef.current[idx];
        if (id) {
          e.preventDefault();
          open(id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, goHome]);

  const setLocalePersisted = useCallback(
    (next: Locale): void => {
      setLocale(next);
      persist({ [KEY_LOCALE]: next });
    },
    [persist],
  );

  const setThemePersisted = useCallback((next: ThemeMode): void => {
    setThemeMode(next);
    // Немедленно применяем (в превью-харнессе initTheme не вызывается).
    document.documentElement.dataset.theme = next === 'system' ? resolvedTheme() : next;
  }, []);

  return {
    view,
    tool,
    q,
    setQ,
    palOpen,
    setPalOpen,
    open,
    goHome,
    goSettings,
    pins,
    isPinned,
    togglePin,
    setLocalePersisted,
    setThemePersisted,
  };
}

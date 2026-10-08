/**
 * Лёгкий рантайм-каталог локализации (RU/EN) с реактивной сменой языка.
 *
 * Своя мапа (а не `chrome.i18n`) — потому что язык переключается в рантайме, а
 * фичи домешивают свои фрагменты через дескриптор (`FeatureModule.i18n`,
 * ADR-0011) без правки shell-каталога. `_locales/*` из TASK-002 остаётся для
 * манифеста (name/description при `default_locale`).
 */
import { signal } from '@preact/signals';

export type Locale = 'ru' | 'en';
type Catalog = Record<string, string>;

const catalogs: Record<Locale, Catalog> = {
  ru: {
    'app.title': 'QAid',
    'theme.toggle': 'Сменить тему',
    'theme.light': 'Светлая тема',
    'theme.dark': 'Тёмная тема',
    'theme.system': 'Системная тема',
    'category.generators': 'Генераторы',
    'category.inspector': 'Инспектор',
    'category.storage': 'Хранилище',
    'category.environment': 'Окружение',
    'category.forms': 'Формы',
    'category.utils': 'Утилиты',
    'category.mock': 'Мок',
    'shell.empty': 'В этой категории пока нет инструментов',
    'shell.search': 'Поиск',
    'shell.settings': 'Настройки',
    'shell.language': 'Язык',
    'shell.theme': 'Тема',
    'shell.theme.light': 'Светлая',
    'shell.theme.dark': 'Тёмная',
    'shell.palette.placeholder': 'Найти инструмент или команду…',
    'shell.palette.empty': 'Ничего не найдено',
    'shell.pin': 'Закрепить',
    'shell.unpin': 'Открепить',
    'shell.openSidePanel': 'Открыть side panel',
    'shell.openInPanel':
      'Выбор элемента на странице работает только в side panel — popup закрывается при клике по странице.',
    'shell.loading': 'Загрузка инструмента…',
    'shell.loadError': 'Не удалось загрузить инструмент. Проверьте подключение и повторите.',
    'shell.retry': 'Повторить',
    'shell.recent': 'Недавнее',
    'action.copy': 'Копировать',
    'toast.copied': 'Скопировано',
    'copy.error': 'Не удалось скопировать',
    'output.empty': 'Пусто',
    'common.on': 'вкл',
    'common.off': 'выкл',
  },
  en: {
    'app.title': 'QAid',
    'theme.toggle': 'Toggle theme',
    'theme.light': 'Light theme',
    'theme.dark': 'Dark theme',
    'theme.system': 'System theme',
    'category.generators': 'Generators',
    'category.inspector': 'Inspector',
    'category.storage': 'Storage',
    'category.environment': 'Environment',
    'category.forms': 'Forms',
    'category.utils': 'Utilities',
    'category.mock': 'Mock',
    'shell.empty': 'No tools in this category yet',
    'shell.search': 'Search',
    'shell.settings': 'Settings',
    'shell.language': 'Language',
    'shell.theme': 'Theme',
    'shell.theme.light': 'Light',
    'shell.theme.dark': 'Dark',
    'shell.palette.placeholder': 'Find a tool or command…',
    'shell.palette.empty': 'No results',
    'shell.pin': 'Pin',
    'shell.unpin': 'Unpin',
    'shell.openSidePanel': 'Open side panel',
    'shell.openInPanel':
      'Element picking works only in the side panel — the popup closes when you click the page.',
    'shell.loading': 'Loading tool…',
    'shell.loadError': 'Could not load this tool. Check your connection and retry.',
    'shell.retry': 'Retry',
    'shell.recent': 'Recent',
    'action.copy': 'Copy',
    'toast.copied': 'Copied',
    'copy.error': 'Copy failed',
    'output.empty': 'Empty',
    'common.on': 'on',
    'common.off': 'off',
  },
};

export const locale = signal<Locale>('ru');

export function setLocale(next: Locale): void {
  locale.value = next;
}

/** Домешивает фрагмент каталога фичи (идемпотентно перезаписывает ключи). */
export function mergeCatalog(next: Locale, fragment: Catalog): void {
  Object.assign(catalogs[next], fragment);
}

/** Переводит ключ; неизвестный ключ возвращается как есть (видимый маркер пропуска). */
export function t(key: string, vars?: Record<string, string | number>): string {
  let str = catalogs[locale.value][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}

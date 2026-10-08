/**
 * Подписи оболочки v3 (хедер, home, настройки, палитра, fallback). Домешиваются
 * в общий каталог i18n. Значения сверены с эталоном v3-дизайна.
 */
import { mergeCatalog } from '@/i18n';

const EN: Record<string, string> = {
  'shell.back': 'Back',
  'shell.searchTools': 'Search tools',
  'shell.searchPlaceholder': 'Find a tool — e.g. “cookies”, “contrast”',
  'shell.noMatch': 'Nothing found. Try another word.',
  'shell.activeNow': 'Active on this tab',
  'shell.pinned': 'Pinned',
  'shell.pinHint': '★ in a tool to pin',
  'shell.pinToHome': 'Pin to home',
  'shell.light': 'Light',
  'shell.dark': 'Dark',
  'shell.shortcuts': 'Shortcuts',
  'shell.sc.search': 'Search',
  'shell.sc.back': 'Back',
  'shell.sc.pinned': 'Open pinned tool',
  'shell.syncH': 'Sync between devices',
  'shell.syncOn': 'Sync my settings',
  'shell.syncSubOff': 'Off. Settings stay on this device.',
  'shell.syncSubOn': 'Last synced just now',
  'shell.quota': 'Used of browser sync quota',
  'shell.syncNote':
    'Uses your browser account. No QAid server. When it conflicts, the latest change wins.',
  'shell.secretsNote': 'Secrets never leave this device',
  'shell.panelTitle': 'Opens in the side panel',
  'shell.panelBody':
    'This tool follows the page while you work, so it needs the side panel. Your settings move with it.',

  // Открепление на страницу (TASK-062). Строки eager (shell), чтобы тост ошибки был
  // локализован независимо от ленивой загрузки инспекторских фич.
  'shell.detach': 'Detach to the page',
  'shell.detach.noTab': 'Could not find the active tab.',
  'shell.detach.privileged': 'The panel can’t run on this browser page.',
  'shell.detach.permission': 'Page access was declined. Allow it to float the panel on this tab.',
  'shell.detach.error': 'Could not open the floating panel on this page.',

  'shell.ns.theme': 'Theme and language',
  'shell.ns.theme.sub': 'Appearance',
  'shell.ns.generators': 'Generator settings',
  'shell.ns.generators.sub': 'Numbers, text, UUID',
  'shell.ns.forms': 'Form data profiles',
  'shell.ns.forms.sub': 'Autofill presets',
  'shell.ns.mocks': 'Mock scenarios',
  'shell.ns.mocks.sub': 'Rules and presets',
  'shell.ns.env': 'Environment presets',
  'shell.ns.env.sub': 'Devices, places, flags',
  'shell.ns.storage': 'Storage snapshots',
  'shell.ns.sessions': 'Login profiles',
  'shell.ns.secrets': 'Contain secrets — never synced',
};

const RU: Record<string, string> = {
  'shell.back': 'Назад',
  'shell.searchTools': 'Поиск инструментов',
  'shell.searchPlaceholder': 'Найти инструмент — «cookies», «контраст»',
  'shell.noMatch': 'Ничего не найдено. Попробуйте другое слово.',
  'shell.activeNow': 'Активно на этой вкладке',
  'shell.pinned': 'Закреплённые',
  'shell.pinHint': '★ в инструменте — закрепить',
  'shell.pinToHome': 'Закрепить',
  'shell.light': 'Светлая',
  'shell.dark': 'Тёмная',
  'shell.shortcuts': 'Горячие клавиши',
  'shell.sc.search': 'Поиск',
  'shell.sc.back': 'Назад',
  'shell.sc.pinned': 'Открыть закреплённый',
  'shell.syncH': 'Синхронизация между устройствами',
  'shell.syncOn': 'Синхронизировать настройки',
  'shell.syncSubOff': 'Выключено. Настройки только на этом устройстве.',
  'shell.syncSubOn': 'Синхронизировано только что',
  'shell.quota': 'Занято из квоты синхронизации',
  'shell.syncNote':
    'Через аккаунт браузера, без серверов QAid. При конфликте побеждает последнее изменение.',
  'shell.secretsNote': 'Секреты не покидают это устройство',
  'shell.panelTitle': 'Работает в боковой панели',
  'shell.panelBody':
    'Инструмент следит за страницей, пока вы работаете, поэтому ему нужна боковая панель. Настройки перенесутся.',

  // Открепление на страницу (TASK-062).
  'shell.detach': 'Открепить на страницу',
  'shell.detach.noTab': 'Не удалось определить активную вкладку.',
  'shell.detach.privileged': 'Панель не работает на этой служебной странице браузера.',
  'shell.detach.permission':
    'Доступ к странице отклонён. Разрешите его, чтобы открепить панель на этой вкладке.',
  'shell.detach.error': 'Не удалось открыть плавающую панель на этой странице.',

  'shell.ns.theme': 'Тема и язык',
  'shell.ns.theme.sub': 'Внешний вид',
  'shell.ns.generators': 'Настройки генераторов',
  'shell.ns.generators.sub': 'Числа, строки, UUID',
  'shell.ns.forms': 'Профили данных форм',
  'shell.ns.forms.sub': 'Пресеты автозаполнения',
  'shell.ns.mocks': 'Сценарии моков',
  'shell.ns.mocks.sub': 'Правила и пресеты',
  'shell.ns.env': 'Пресеты окружения',
  'shell.ns.env.sub': 'Устройства, места, флаги',
  'shell.ns.storage': 'Снимки хранилища',
  'shell.ns.sessions': 'Профили входа',
  'shell.ns.secrets': 'Содержат секреты — не синкаются',
};

mergeCatalog('en', EN);
mergeCatalog('ru', RU);

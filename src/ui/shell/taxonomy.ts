/**
 * Каталог инструментов поверхности — v3 (модель Home → Tool).
 *
 * Единый источник правды для домашнего каталога (6 групп), поиска (имя + описание
 * + синонимы EN/RU), закреплений и попап-fallback. Каждая строка каталога
 * отображается ПРЯМО на фичу реестра по `featureId` (семейства/под-вкладки
 * decode/time живут ВНУТРИ своих фич, а не в навигации). Ядро/фичи об этом слое
 * не знают: он живёт в оболочке и лишь читает реестр (инвариант расширяемости —
 * фичи не «дотягиваются» до навигации).
 *
 * Значения (группы, имена, описания, синонимы, порядок) точно сверены с
 * эталоном v3-дизайна.
 */
import { mergeCatalog } from '@/i18n';

/** Группа каталога. */
export type GroupId = 'capture' | 'inspect' | 'network' | 'browser' | 'forms' | 'data';

/** Порядок групп на домашнем экране. */
export const GROUP_ORDER: GroupId[] = ['capture', 'inspect', 'network', 'browser', 'forms', 'data'];

/** Инструмент каталога: строка Home, цель поиска, элемент pin. */
export interface CatalogTool {
  /** Реальная фича реестра. */
  id: string;
  group: GroupId;
}

/**
 * Инструменты в порядке макета. `id` === `featureId` реестра. `settings-sync`
 * здесь НЕТ: он живёт в экране настроек, не в каталоге (его достижимость
 * обеспечивает Settings view — см. фитнес-тест реестра).
 */
export const TOOLS: CatalogTool[] = [
  { id: 'bug-report', group: 'capture' },
  { id: 'screenshot', group: 'capture' },
  { id: 'screen-recording', group: 'capture' },
  { id: 'inspector-probe', group: 'inspect' },
  { id: 'defect-detector', group: 'inspect' },
  { id: 'inspector-contrast', group: 'inspect' },
  { id: 'inspector-ruler', group: 'inspect' },
  { id: 'inspector-palette', group: 'inspect' },
  { id: 'inspector-fonts', group: 'inspect' },
  { id: 'snapshot-diff', group: 'inspect' },
  { id: 'mock-network', group: 'network' },
  { id: 'dom-override', group: 'network' },
  { id: 'storage-editor', group: 'browser' },
  { id: 'session-profiles', group: 'browser' },
  { id: 'forms', group: 'forms' },
  { id: 'environment', group: 'forms' },
  { id: 'decoders', group: 'data' },
  { id: 'timestamp-hash', group: 'data' },
  { id: 'random-numbers', group: 'data' },
  { id: 'random-strings', group: 'data' },
];

/** featureId → группа (для заголовка tool-view, попап-fallback). */
const TOOL_GROUP: Record<string, GroupId> = (() => {
  const m: Record<string, GroupId> = {};
  for (const t of TOOLS) m[t.id] = t.group;
  return m;
})();

export function groupOfTool(id: string): GroupId | undefined {
  return TOOL_GROUP[id];
}

/**
 * Инструменты «только для side panel»: живой захват элементов на странице
 * невозможен в transient-popup (он закрывается по клику на страницу). В popup
 * они рендерят fallback «открыть side panel» (сверено с `liveTools` в макете и
 * `requiresPanel` реестра).
 */
export const PANEL_ONLY: ReadonlySet<string> = new Set([
  'inspector-probe',
  'inspector-ruler',
  'dom-override',
  'screenshot',
  'screen-recording',
]);

/** Закрепления по умолчанию (сверено с макетом). */
export const DEFAULT_PINS: string[] = ['bug-report', 'screenshot', 'mock-network', 'forms'];

// ── i18n-ключи каталога ──────────────────────────────────────────────────────
export const groupNameKey = (id: GroupId): string => `cat.group.${id}`;
export const toolNameKey = (id: string): string => `cat.tool.${id}.name`;
export const toolDescKey = (id: string): string => `cat.tool.${id}.desc`;
export const toolKwKey = (id: string): string => `cat.tool.${id}.kw`;

// ── локализация каталога (домешивается в общий каталог оболочки) ──────────────
const EN: Record<string, string> = {
  'cat.group.capture': 'Capture & report',
  'cat.group.inspect': 'Inspect the page',
  'cat.group.network': 'Network & mocks',
  'cat.group.browser': 'Browser data',
  'cat.group.forms': 'Forms & environment',
  'cat.group.data': 'Data & generators',

  'cat.tool.bug-report.name': 'Bug report',
  'cat.tool.bug-report.desc': 'Collect everything a developer needs',
  'cat.tool.bug-report.kw': 'bug export agent claude cursor codex',
  'cat.tool.screenshot.name': 'Screenshot',
  'cat.tool.screenshot.desc': 'Capture and mark up the page',
  'cat.tool.screenshot.kw': 'screenshot annotate blur',
  'cat.tool.screen-recording.name': 'Screen video',
  'cat.tool.screen-recording.desc': 'Record the screen with sound',
  'cat.tool.screen-recording.kw': 'video record gif webm',
  'cat.tool.inspector-probe.name': 'Element inspector',
  'cat.tool.inspector-probe.desc': 'Pick an element and see its styles',
  'cat.tool.inspector-probe.kw': 'inspect element css dom',
  'cat.tool.defect-detector.name': 'Find defects',
  'cat.tool.defect-detector.desc': 'Missing alt, broken images, empty buttons',
  'cat.tool.defect-detector.kw': 'defect alt broken a11y',
  'cat.tool.inspector-contrast.name': 'Contrast check',
  'cat.tool.inspector-contrast.desc': 'Text readability by WCAG',
  'cat.tool.inspector-contrast.kw': 'contrast wcag aa aaa',
  'cat.tool.inspector-ruler.name': 'Ruler',
  'cat.tool.inspector-ruler.desc': 'Distances, sizes and box model',
  'cat.tool.inspector-ruler.kw': 'ruler measure spacing',
  'cat.tool.inspector-palette.name': 'Page colors',
  'cat.tool.inspector-palette.desc': 'All colors used, with copy',
  'cat.tool.inspector-palette.kw': 'palette colors hex eyedropper',
  'cat.tool.inspector-fonts.name': 'Page fonts',
  'cat.tool.inspector-fonts.desc': 'Families, sizes and sources',
  'cat.tool.inspector-fonts.kw': 'fonts typography',
  'cat.tool.snapshot-diff.name': 'Compare page states',
  'cat.tool.snapshot-diff.desc': 'What changed between two moments',
  'cat.tool.snapshot-diff.kw': 'snapshot diff compare',
  'cat.tool.mock-network.name': 'Mock requests',
  'cat.tool.mock-network.desc': 'See requests and fake responses',
  'cat.tool.mock-network.kw': 'mock network api 500 throttle offline',
  'cat.tool.dom-override.name': 'Edit page content',
  'cat.tool.dom-override.desc': 'Change text, hide or overflow elements',
  'cat.tool.dom-override.kw': 'dom override text hide',
  'cat.tool.storage-editor.name': 'Cookies & storage',
  'cat.tool.storage-editor.desc': 'View, edit and clear site data',
  'cat.tool.storage-editor.kw': 'cookies localstorage indexeddb cache',
  'cat.tool.session-profiles.name': 'Login profiles',
  'cat.tool.session-profiles.desc': 'Switch between accounts in one click',
  'cat.tool.session-profiles.kw': 'session profile login account',
  'cat.tool.forms.name': 'Fill & check forms',
  'cat.tool.forms.desc': 'Test data in one click, plus audit',
  'cat.tool.forms.kw': 'forms autofill audit',
  'cat.tool.environment.name': 'Device & location',
  'cat.tool.environment.desc': 'User agent, language, geo, time zone',
  'cat.tool.environment.kw': 'environment user agent geo timezone',
  'cat.tool.decoders.name': 'Decode & format',
  'cat.tool.decoders.desc': 'JWT, Base64, URL, JSON',
  'cat.tool.decoders.kw': 'jwt base64 url json decode',
  'cat.tool.timestamp-hash.name': 'Time, hash & UUID',
  'cat.tool.timestamp-hash.desc': 'Unix time, SHA, MD5, UUID v4',
  'cat.tool.timestamp-hash.kw': 'timestamp unix hash sha md5 uuid',
  'cat.tool.random-numbers.name': 'Random numbers',
  'cat.tool.random-numbers.desc': 'Integers or decimals in a range',
  'cat.tool.random-numbers.kw': 'random number generator',
  'cat.tool.random-strings.name': 'Random text',
  'cat.tool.random-strings.desc': 'Strings from any alphabet',
  'cat.tool.random-strings.kw': 'random string text password',
};

const RU: Record<string, string> = {
  'cat.group.capture': 'Захват и отчёты',
  'cat.group.inspect': 'Осмотр страницы',
  'cat.group.network': 'Сеть и моки',
  'cat.group.browser': 'Данные браузера',
  'cat.group.forms': 'Формы и окружение',
  'cat.group.data': 'Данные и генераторы',

  'cat.tool.bug-report.name': 'Отчёт о баге',
  'cat.tool.bug-report.desc': 'Всё, что нужно разработчику',
  'cat.tool.bug-report.kw': 'баг отчет export agent claude cursor codex',
  'cat.tool.screenshot.name': 'Скриншот',
  'cat.tool.screenshot.desc': 'Снимок страницы с пометками',
  'cat.tool.screenshot.kw': 'скрин screenshot annotate blur',
  'cat.tool.screen-recording.name': 'Запись видео',
  'cat.tool.screen-recording.desc': 'Запись экрана со звуком',
  'cat.tool.screen-recording.kw': 'видео запись video record gif webm',
  'cat.tool.inspector-probe.name': 'Инспектор элемента',
  'cat.tool.inspector-probe.desc': 'Свойства и стили элемента',
  'cat.tool.inspector-probe.kw': 'инспектор inspect element css dom',
  'cat.tool.defect-detector.name': 'Поиск дефектов',
  'cat.tool.defect-detector.desc': 'Нет alt, битые картинки, пустые кнопки',
  'cat.tool.defect-detector.kw': 'дефекты defect alt broken a11y',
  'cat.tool.inspector-contrast.name': 'Проверка контраста',
  'cat.tool.inspector-contrast.desc': 'Читаемость текста по WCAG',
  'cat.tool.inspector-contrast.kw': 'контраст contrast wcag aa aaa',
  'cat.tool.inspector-ruler.name': 'Линейка',
  'cat.tool.inspector-ruler.desc': 'Расстояния, размеры, отступы',
  'cat.tool.inspector-ruler.kw': 'линейка ruler measure spacing',
  'cat.tool.inspector-palette.name': 'Цвета страницы',
  'cat.tool.inspector-palette.desc': 'Все цвета на странице',
  'cat.tool.inspector-palette.kw': 'цвета palette colors hex eyedropper',
  'cat.tool.inspector-fonts.name': 'Шрифты страницы',
  'cat.tool.inspector-fonts.desc': 'Семейства, размеры, источники',
  'cat.tool.inspector-fonts.kw': 'шрифты fonts typography',
  'cat.tool.snapshot-diff.name': 'Сравнить состояния',
  'cat.tool.snapshot-diff.desc': 'Что изменилось между снимками',
  'cat.tool.snapshot-diff.kw': 'сравнение snapshot diff compare',
  'cat.tool.mock-network.name': 'Подмена запросов',
  'cat.tool.mock-network.desc': 'Запросы и подмена ответов',
  'cat.tool.mock-network.kw': 'сеть мок mock network api 500 throttle offline',
  'cat.tool.dom-override.name': 'Подмена на странице',
  'cat.tool.dom-override.desc': 'Текст, скрытие, длинный контент',
  'cat.tool.dom-override.kw': 'подмена dom override text hide',
  'cat.tool.storage-editor.name': 'Cookies и хранилище',
  'cat.tool.storage-editor.desc': 'Просмотр, правка, очистка',
  'cat.tool.storage-editor.kw': 'хранилище cookies localstorage indexeddb cache',
  'cat.tool.session-profiles.name': 'Профили входа',
  'cat.tool.session-profiles.desc': 'Смена аккаунта в один клик',
  'cat.tool.session-profiles.kw': 'сессия профиль session profile login account',
  'cat.tool.forms.name': 'Заполнить формы',
  'cat.tool.forms.desc': 'Тест-данные в один клик + аудит',
  'cat.tool.forms.kw': 'формы forms autofill audit',
  'cat.tool.environment.name': 'Устройство и место',
  'cat.tool.environment.desc': 'UA, язык, геолокация, часовой пояс',
  'cat.tool.environment.kw': 'эмуляция environment user agent geo timezone',
  'cat.tool.decoders.name': 'Декодеры',
  'cat.tool.decoders.desc': 'JWT, Base64, URL, JSON',
  'cat.tool.decoders.kw': 'декод jwt base64 url json decode',
  'cat.tool.timestamp-hash.name': 'Время, хеши, UUID',
  'cat.tool.timestamp-hash.desc': 'Unix-время, SHA, MD5, UUID',
  'cat.tool.timestamp-hash.kw': 'время timestamp unix hash sha md5 uuid',
  'cat.tool.random-numbers.name': 'Случайные числа',
  'cat.tool.random-numbers.desc': 'Целые или дробные в диапазоне',
  'cat.tool.random-numbers.kw': 'числа random number генератор',
  'cat.tool.random-strings.name': 'Случайные строки',
  'cat.tool.random-strings.desc': 'Строки из любого алфавита',
  'cat.tool.random-strings.kw': 'строки random string text password',
};

mergeCatalog('en', EN);
mergeCatalog('ru', RU);

/**
 * Индекс поиска: на каждый инструмент — объединённый blob из имени, описания и
 * синонимов ОБОИХ языков + имён групп (нижний регистр). Поиск кросс-языковой —
 * «контраст», «cookies», «jwt» находят инструмент независимо от текущего языка UI
 * (README: «EN/RU synonyms»).
 */
export const SEARCH_BLOB: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const tool of TOOLS) {
    const parts = [
      EN[toolNameKey(tool.id)],
      RU[toolNameKey(tool.id)],
      EN[toolDescKey(tool.id)],
      RU[toolDescKey(tool.id)],
      EN[toolKwKey(tool.id)],
      RU[toolKwKey(tool.id)],
      EN[groupNameKey(tool.group)],
      RU[groupNameKey(tool.group)],
    ];
    m[tool.id] = parts.filter(Boolean).join(' ').toLowerCase();
  }
  return m;
})();

/** id инструментов, подходящих под запрос (кросс-языковой поиск). */
export function searchTools(query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return TOOLS.filter((tool) => SEARCH_BLOB[tool.id]?.includes(needle)).map((tool) => tool.id);
}

/**
 * Контракт «Agent Handoff» (TASK-040) — общий тип-слой ядра доставки баг-репорта
 * AI-агенту (Claude Code / Codex / Cursor) БЕЗ установки стороннего софта.
 *
 * Живёт отдельно от реализаций (`packager.ts`, `deep-link.ts`, `targets.ts`,
 * `transports/*`), чтобы чистая логика, транспорты (DOM/`chrome.*`) и тул-специфичные
 * адаптеры (TASK-043/044/045) зависели только от ФОРМЫ данных и от контракта
 * адресата — а не друг от друга (инвариант расширяемости §1: фичи/модули не
 * импортируют внутренности соседей). Это единственный «замороженный» файл ядра:
 * адаптеры адресатов пишутся ПОВЕРХ него.
 *
 * Все структуры JSON-сериализуемы и не несут DOM/`chrome.*`-объектов через границы;
 * транспорты передаются в адресат как ИНЪЕКТИРУЕМЫЕ зависимости
 * (`DeliveryContext.transports`), поэтому `deliver()` тестируется на фейках без
 * браузера (канон: чистая логика адресата покрыта юнит-тестами).
 */
import type { ComponentType } from 'preact';
import type { BugArtifact } from '../types';

// ── версии и лимиты ───────────────────────────────────────────────────────────

/** Версия формы пакета (для будущих миграций сериализации). */
export const HANDOFF_PACKAGE_VERSION = 1 as const;

/**
 * Жёсткий лимит длины промпта в deep-link (символов ПОСЛЕ URL-encode параметра).
 * Диктуется ограничением Claude Code `q` (5 000). Полный артефакт туда не влезает —
 * поэтому связка «файл (FSA) + короткий промпт-указатель» (см. ADR-0043).
 */
export const DEEP_LINK_PROMPT_LIMIT = 5000 as const;

/** Относительный путь-каталог, куда FSA-транспорт кладёт артефакты в корне проекта. */
export const HANDOFF_DIR = '.qa-toolbox/bug-reports' as const;

// ── пакет для агента ───────────────────────────────────────────────────────────

/**
 * Переносимый «пакет для агента»: детерминированная сериализация `BugArtifact` в две
 * формы — (a) полный артефакт (Markdown + JSON, как в TASK-025) для записи в файл;
 * (b) компактный промпт (≤ лимита deep-link) с постановкой задачи + указателем на
 * файл + краткой сутью. Полностью выводим из `BugArtifact` + опций (чистая функция).
 */
export interface AgentHandoffPackage {
  packageVersion: typeof HANDOFF_PACKAGE_VERSION;
  /** ISO-время сборки пакета. */
  createdAt: string;
  /** kebab-slug для имени файла и указателя (детерминирован из сути + времени). */
  slug: string;
  /** `renderMarkdown(artifact)` (TASK-025) — полный человекочитаемый отчёт. */
  fullMarkdown: string;
  /** `renderJson(artifact)` — машиночитаемая форма. */
  fullJson: string;
  /** Компактный промпт ≤ лимита deep-link, со ссылкой на файл (см. `HANDOFF_DIR`). */
  compactPrompt: string;
  /** Исходный артефакт (для повторного рендера/адаптеров). */
  artifact: BugArtifact;
}

/** Опции сборки пакета. */
export interface PackageOptions {
  /** ISO-время сборки (инъекция для детерминизма тестов). */
  createdAt: string;
  /** Класть ли полный JSON в компактный промпт. По умолчанию `false` (он есть в файле). */
  includeJson?: boolean;
  /** Лимит компактного промпта. По умолчанию `DEEP_LINK_PROMPT_LIMIT`. */
  promptLimit?: number;
  /**
   * Относительный путь файла, на который ссылается компактный промпт. По умолчанию
   * `${HANDOFF_DIR}/latest.md` — «свежий» указатель, куда пишет FSA-транспорт.
   */
  filePointer?: string;
}

// ── таргет проекта (куда указывает deep-link) ──────────────────────────────────

/**
 * Разовая настройка «куда» слать. FSA-handle НЕ раскрывает абсолютный путь
 * (безопасность браузера), поэтому `cwd`/`repo` задаёт пользователь один раз в
 * настройках (это конфиг, не установка). `repo` предпочтительнее — агент сам
 * резолвит слаг в локальный клон.
 */
export interface ProjectTarget {
  /** `owner/name` — GitHub-слаг репозитория (предпочтительно). */
  repo?: string;
  /** Абсолютный путь к корню проекта (валидируется: без `..`/UNC/control). */
  cwd?: string;
}

// ── deep-link (общий строитель; тул-схемы — в адаптерах) ───────────────────────

/**
 * Спецификация deep-link: общий строитель (`buildDeepLink`) собирает
 * `<scheme>://<path>?<params>&<promptParam>=<prompt>` с URL-энкодом и ЖЁСТКОЙ
 * гарантией лимита промпта. Конкретные схемы (`claude-cli`/`codex`/`cursor`/`vscode`)
 * и их параметры задают адаптеры TASK-043/044/045.
 */
export interface DeepLinkSpec {
  /** Схема без `://`, напр. `'claude-cli'`. Валидируется как URL-scheme. */
  scheme: string;
  /** Путь после `://`, напр. `'open'` → `claude-cli://open`. Может быть пустым. */
  path?: string;
  /** Таргет проекта → параметры `repo`/`cwd` (валидируются). */
  target?: ProjectTarget;
  /** Компактный промпт (несущий указатель на файл). */
  prompt: string;
  /** Имя query-параметра для промпта. По умолчанию `'q'`. */
  promptParam?: string;
  /** Лимит длины промпта (после encode). По умолчанию `DEEP_LINK_PROMPT_LIMIT`. */
  limit?: number;
  /**
   * Относительный путь файла для пометки усечения («полный контекст — в файле …»).
   * Добавляется в конец промпта, если тот пришлось усечь под лимит.
   */
  filePointer?: string;
  /** Доп. query-параметры схемы (напр. `{ ide: '1' }`); значения URL-энкодятся. */
  extraParams?: Record<string, string>;
}

/** Причины отказа сборки deep-link (данными, не throw). */
export type DeepLinkError =
  | { kind: 'invalid-scheme'; detail: string }
  | { kind: 'invalid-cwd'; detail: string }
  | { kind: 'invalid-repo'; detail: string }
  | { kind: 'no-target'; detail: string };

/** Успех сборки deep-link. */
export interface DeepLinkOk {
  /** Готовый URL для открытия под жестом. */
  url: string;
  /** Промпт был усечён под лимит (в UI можно предупредить). */
  truncated: boolean;
  /** Длина промпта (после encode), которая реально ушла в URL. */
  promptLength: number;
}

// ── транспорты ─────────────────────────────────────────────────────────────────

/** Вид транспорта доставки (все три работают внутри расширения, без установки). */
export type TransportKind = 'deep-link' | 'fs-access' | 'clipboard';

/**
 * Что фактически доступно в текущей среде (popup/side panel). Определяется в
 * рантайме и передаётся в `deliver()`; deep-link НЕ детектируется (нельзя из
 * браузера узнать, зарегистрирована ли схема) — поэтому его в возможностях нет,
 * а фолбэк показывается всегда.
 */
export interface HandoffCapabilities {
  /** File System Access API присутствует (`window.showDirectoryPicker`). */
  fsAccess: boolean;
  /** Есть буфер обмена (практически всегда true в document-контексте). */
  clipboard: boolean;
}

/** Результат записи артефактов в папку проекта (FSA-транспорт). */
export interface FsWriteResult {
  ok: boolean;
  /** Относительные пути записанных файлов (для инструкции пользователю). */
  written: string[];
  /** Указатель «свежего» файла (`${HANDOFF_DIR}/latest.md`) для промпта. */
  latestPath: string;
  /** Локализованная причина, если записать не удалось (деградация, не throw). */
  error?: string;
}

/**
 * Инъектируемые транспорты: адресат вызывает их, не зная про DOM/`chrome.*`.
 * Реальные реализации собирает рантайм (UI); тесты подставляют фейки.
 */
export interface HandoffTransports {
  /** Записать полный артефакт (`.md`+`.json`+`latest.md`) в выбранную папку. */
  writeProjectFiles(pkg: AgentHandoffPackage): Promise<FsWriteResult>;
  /** Положить текст в буфер обмена. `true` — успех. */
  copyToClipboard(text: string): Promise<boolean>;
  /** Открыть deep-link под пользовательским жестом (оптимистично, без детекта). */
  openDeepLink(url: string): void;
}

// ── адресат (реестр + контракт доставки) ───────────────────────────────────────

/** i18n-функция, передаваемая в адресат (не тянем `@/i18n` в чистую логику). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Настройки доставки, релевантные адресату. */
export interface HandoffDeliverySettings {
  /** Класть ли полный JSON в промпт/буфер. */
  includeJson: boolean;
  /** Лимит компактного промпта. */
  promptLimit: number;
}

/**
 * Контекст доставки: всё, что нужно `deliver()` — пакет, таргет, возможности среды,
 * инъектируемые транспорты, настройки и i18n. Не содержит DOM/`chrome.*` напрямую.
 */
export interface DeliveryContext {
  pkg: AgentHandoffPackage;
  project: ProjectTarget;
  capabilities: HandoffCapabilities;
  transports: HandoffTransports;
  settings: HandoffDeliverySettings;
  t: Translate;
}

/**
 * Действие-фолбэк, всегда предлагаемое пользователю (нельзя определить, открылся ли
 * deep-link → «не открылось? — вот что делать»). Никогда не «тихий провал».
 */
export interface HandoffFallback {
  /** Локализованная подпись кнопки. */
  label: string;
  /** Выполнить фолбэк (копировать промпт / записать файл / показать команду). */
  run: () => Promise<void> | void;
}

/**
 * Итог доставки: что было использовано, локализованное сообщение-инструкция,
 * всегда доступный фолбэк и путь записанного файла (если был).
 */
export interface DeliveryResult {
  ok: boolean;
  usedTransport: TransportKind | 'none';
  /** Локализованное сообщение/инструкция для тоста («в открывшемся окне нажмите Enter»). */
  message: string;
  /** Всегда предлагаемая альтернатива (см. `HandoffFallback`). */
  fallbacks: HandoffFallback[];
  /** Относительный путь записанного файла (если писали в проект). */
  filePath?: string;
}

/**
 * Адресат доставки (по образцу `features/registry.ts`). Декларирует id, i18n-заголовок,
 * иконку, предпочитаемый транспорт и умеет принять пакет с деградацией. Базовые
 * адресаты (`clipboard`, `project-folder`) — тул-независимы; тул-специфичные
 * (`claude-code`, `cursor`, `codex`) регистрируют TASK-043/044/045.
 */
export interface HandoffTarget {
  /** Уникальный id, напр. `'clipboard'`, `'claude-code'`. */
  id: string;
  /** i18n-ключ заголовка (в каталоге фичи). */
  titleKey: string;
  /** Иконка для селекта адресатов. */
  icon?: ComponentType;
  /** Предпочитаемый транспорт (влияет на подсказки/порядок деградации). */
  preferredTransport: TransportKind;
  /** Порядок в списке (по возрастанию). */
  order?: number;
  /** Выполнить доставку пакета с деградацией. Ошибки — данными в `DeliveryResult`. */
  deliver(ctx: DeliveryContext): Promise<DeliveryResult>;
}

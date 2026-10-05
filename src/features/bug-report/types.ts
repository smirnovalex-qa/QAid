/**
 * Типы фичи «Экспорт состояния бага» (TASK-025). Живут отдельно от zod-схем
 * (`logic.ts`), чтобы чистая логика, MAIN-сборщики (`collectors/*`) и адаптеры
 * зависели только от формы данных, а не от zod.
 *
 * Все структуры JSON-сериализуемы — DOM/`chrome.*`-объекты через границу инъекции
 * и сообщений не ходят, только их плоские снимки. Артефакт «состояния бага»
 * собирается КОМПОЗИЦИЕЙ независимых секций-частей: каждый сборщик отдаёт свою
 * часть, а `logic.ts` их только компонует (тестируемо без браузера).
 */
import type { StorageSnapshot } from '@/shared/inspection/storage/types';

export type { StorageSnapshot };

/** Опциональные (включаемые пользователем) секции артефакта. Мета (URL/заголовок) — всегда. */
export type OptionalSectionId =
  'environment' | 'storage' | 'console' | 'network' | 'timeline' | 'note';

/** Полный перечень опциональных секций — единый источник для UI и настроек. */
export const OPTIONAL_SECTIONS: readonly OptionalSectionId[] = [
  'environment',
  'storage',
  'console',
  'network',
  'timeline',
  'note',
];

/** Карта «секция → включена». */
export type SectionSelection = Record<OptionalSectionId, boolean>;

/** Базовая секция: адрес страницы (всегда присутствует в артефакте). */
export interface MetaPart {
  url: string;
  title: string;
}

/** Снимок окружения страницы (MAIN-world): браузер/вьюпорт/локаль/время. */
export interface EnvironmentPart {
  userAgent: string;
  language: string;
  languages: string[];
  platform: string;
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  devicePixelRatio: number;
  /** `Intl.DateTimeFormat().resolvedOptions().locale`. */
  locale: string;
  /** `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timeZone: string;
  /** `new Date().toISOString()` на момент сбора. */
  isoTime: string;
  online: boolean;
  cookieEnabled: boolean;
}

/** Уровень перехваченного сообщения консоли. */
export type ConsoleLevel = 'error' | 'warn';

/** Источник записи: обёртка console, глобальная ошибка или необработанный reject. */
export type ConsoleSource = 'console' | 'onerror' | 'unhandledrejection';

/** Одна запись кольцевого буфера консоли (снимок, без живых объектов). */
export interface ConsoleEntry {
  level: ConsoleLevel;
  source: ConsoleSource;
  text: string;
  /** `Date.now()` на момент события. */
  at: number;
}

/** Одна строка сетевой сводки (производная от `CaughtRequest` TASK-022). */
export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  mocked: boolean;
  source: 'fetch' | 'xhr';
  durationMs: number;
  error: string | null;
}

/**
 * Сетевая секция. `available:false` — лог TASK-022 недоступен (мок-фича не активна
 * на вкладке / нет пойманных запросов): секция честно помечается «недоступно».
 */
export interface NetworkPart {
  available: boolean;
  total: number;
  failed: number;
  mocked: number;
  entries: NetworkEntry[];
}

/** Заметка репортёра: заголовок и шаги воспроизведения. */
export interface NotePart {
  title: string;
  steps: string;
}

// ── таймлайн действий (TASK-036) ─────────────────────────────────────────────

/** Тип значимого действия пользователя, попадающего в кольцевой буфер. */
export type ActionKind = 'click' | 'input' | 'change' | 'submit' | 'navigation' | 'key' | 'resize';

/**
 * Одна запись кольцевого буфера действий (снимок MAIN-world, без живых DOM-ссылок).
 * `at` — `Date.now()` момента события (единая ось с консолью). Приватность:
 * значения полей ввода в `detail` МАСКИРУЮТСЯ (`***`), пароль не читается никогда.
 */
export interface ActionRecord {
  kind: ActionKind;
  at: number;
  /** Устойчивое описание цели (селектор/роль/подсказка). */
  target?: string;
  /** Тип поля для `input`/`change` (`email`, `text`, `textarea`, `select`…). */
  field?: string;
  /** Доп. деталь: имя клавиши, URL навигации, размер вьюпорта, маркер значения. */
  detail?: string;
}

/**
 * Якорь клоков MAIN-world для перевода монотонных таймстемпов (`performance.now()`,
 * напр. `startedAt` сетевых записей TASK-022) на wall-clock ось (`Date.now()`),
 * снятый в момент чтения буфера действий той же страницы (общий `performance`).
 */
export interface TimelineClockAnchor {
  perfNow: number;
  wall: number;
}

/** Снимок буфера действий + якорь клоков (ответ сборщика). */
export interface ActionsSnapshot {
  events: ActionRecord[];
  anchor: TimelineClockAnchor;
}

/** Событие таймлайна: действие пользователя. */
export interface TimelineActionEvent {
  kind: 'action';
  at: number;
  action: ActionKind;
  target?: string;
  field?: string;
  detail?: string;
}

/** Событие таймлайна: запись консоли (ошибка/предупреждение). */
export interface TimelineConsoleEvent {
  kind: 'console';
  at: number;
  level: ConsoleLevel;
  source: ConsoleSource;
  text: string;
}

/** Событие таймлайна: сетевой запрос (из лога TASK-022). */
export interface TimelineNetworkEvent {
  kind: 'network';
  at: number;
  method: string;
  url: string;
  status: number;
  mocked: boolean;
  durationMs: number;
  error: string | null;
}

/** Дискриминированный union событий единой временно́й шкалы. */
export type TimelineEvent = TimelineActionEvent | TimelineConsoleEvent | TimelineNetworkEvent;

/** Части, собранные сборщиками. Мета — обязательна; остальные — по выбору пользователя. */
export interface ArtifactParts {
  meta: MetaPart;
  environment?: EnvironmentPart;
  storage?: StorageSnapshot;
  console?: ConsoleEntry[];
  network?: NetworkPart;
  timeline?: TimelineEvent[];
  note?: NotePart;
}

/** Опции композиции: выбор секций, маскирование, метка времени сбора. */
export interface ComposeOptions {
  sections: SectionSelection;
  mask: boolean;
  capturedAt: string;
}

/**
 * Итоговый артефакт «состояния бага». Невыбранные/недоступные секции — `null`
 * (честная маркировка «секция отсутствует»). `version` — форма для будущих миграций.
 */
export interface BugArtifact {
  version: 1;
  capturedAt: string;
  meta: MetaPart;
  environment: EnvironmentPart | null;
  storage: StorageSnapshot | null;
  console: ConsoleEntry[] | null;
  network: NetworkPart | null;
  /** Единая шкала действий/консоли/сети (TASK-036). `null` — секция не приложена. */
  timeline: TimelineEvent[] | null;
  note: NotePart | null;
}

/** Настройки таймлайна действий (TASK-036): маскирование значений ввода + лимит буфера. */
export interface TimelineSettings {
  /** Маскировать значения полей ввода (`***`). Дефолт — включено (приватность). */
  maskInputs: boolean;
  /** Желаемый размер кольцевого буфера (жёстко ограничен `TIMELINE_MAX`). */
  limit: number;
}

/**
 * Настройки доставки артефакта агенту (TASK-040, ADR-0043). Таргет проекта хранится
 * как две плоские строки (`''` — не задано): FSA-handle не раскрывает абсолютный путь,
 * поэтому `repo`/`cwd` задаёт пользователь один раз (это конфиг, не установка).
 * `promptLimit` по умолчанию зеркалит `DEEP_LINK_PROMPT_LIMIT` (лимит `q` Claude Code).
 */
export interface HandoffSettingsState {
  /** Id последнего выбранного адресата (`clipboard`/`project-folder`/тул-адаптеры). */
  lastTargetId: string;
  /** `owner/name` — GitHub-слаг репозитория (предпочтительно для deep-link). */
  projectRepo: string;
  /** Абсолютный путь к корню проекта (альтернатива `repo`). */
  projectCwd: string;
  /** Класть ли полный JSON в промпт/буфер (по умолчанию нет — он в файле). */
  includeJson: boolean;
  /** Лимит компактного промпта (символов после encode). */
  promptLimit: number;
}

/** Персистентное состояние фичи (namespace `bug-report`): выбор секций + маскирование. */
export interface BugReportSettingsState {
  sections: SectionSelection;
  mask: boolean;
  timeline: TimelineSettings;
  /**
   * Снимок видимой области вкладки в момент фиксации (TASK-037-совместимый seam
   * `capture.visibleTab`). Живёт вне артефакта Markdown/JSON (это компаньон-PNG для
   * локального скачивания), поэтому — отдельный флаг, а не секция `sections`.
   */
  screenshot: boolean;
  /** Доставка агенту (TASK-040). Обратносовместимо: старые снимки без ключа валидны. */
  handoff: HandoffSettingsState;
}

/** Максимум записей в кольцевом буфере консоли (защита от разрастания). */
export const CONSOLE_RING_CAP = 200;

/** Жёсткий потолок кольцевого буфера действий (защита от разрастания на долгих сессиях). */
export const TIMELINE_MAX = 200;

/** Дефолтный желаемый лимит буфера действий. */
export const DEFAULT_TIMELINE_LIMIT = 100;

/**
 * Дефолт выбора секций. Приватность: storage/cookies и таймлайн ВЫКЛЮЧЕНЫ по
 * умолчанию — прикладываются только по явной галочке (могут нести чувствительное:
 * секреты в storage, селекторы/текст-подсказки в таймлайне). Остальные — включены.
 */
export const DEFAULT_SECTIONS: SectionSelection = {
  environment: true,
  storage: false,
  console: true,
  network: true,
  // Таймлайн действий («шаги») — живой канал захвата, включён по умолчанию (значения
  // ввода маскируются: `DEFAULT_TIMELINE_SETTINGS.maskInputs`); storage остаётся off.
  timeline: true,
  note: true,
};

/** Дефолт настроек таймлайна: маскирование включено, стандартный лимит. */
export const DEFAULT_TIMELINE_SETTINGS: TimelineSettings = {
  maskInputs: true,
  limit: DEFAULT_TIMELINE_LIMIT,
};

/**
 * Дефолт лимита компактного промпта — зеркалит `DEEP_LINK_PROMPT_LIMIT`
 * (`handoff/types.ts`, лимит `q` Claude Code = 5000). Держим здесь литералом, чтобы
 * `types.ts` фичи не зависел от `handoff/*` (единый источник самого лимита — там).
 */
export const DEFAULT_PROMPT_LIMIT = 5000;

/** Дефолт доставки агенту: буфер как адресат, таргет не задан, JSON не в промпте. */
export const DEFAULT_HANDOFF_SETTINGS: HandoffSettingsState = {
  lastTargetId: 'clipboard',
  projectRepo: '',
  projectCwd: '',
  includeJson: false,
  promptLimit: DEFAULT_PROMPT_LIMIT,
};

/** Дефолт настроек: секции по умолчанию, маскирование выключено (осознанный выбор). */
export const BUG_REPORT_DEFAULTS: BugReportSettingsState = {
  sections: { ...DEFAULT_SECTIONS },
  mask: false,
  timeline: { ...DEFAULT_TIMELINE_SETTINGS },
  // Скриншот в момент фиксации включён по умолчанию (лёгкий, наглядный контекст).
  screenshot: true,
  handoff: { ...DEFAULT_HANDOFF_SETTINGS },
};

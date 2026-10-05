/**
 * Сборщик «пакета для агента» (TASK-040, ядро Agent Handoff).
 *
 * Чистая функция БЕЗ DOM и `chrome.*`: детерминированно выводит `AgentHandoffPackage`
 * из `BugArtifact` + опций. Полный отчёт (Markdown + JSON) НЕ реимплементируется —
 * переиспользуются рендеры фичи «Экспорт состояния бага» (`../logic`). Здесь же —
 * генерация детерминированного kebab-слага (имя файла/указатель) и сборка КОМПАКТНОГО
 * промпта, гарантированно укладывающегося в лимит deep-link: постановка задачи +
 * указатель на файл (переживает усечение) + краткая суть бага.
 *
 * Инвариант расширяемости: модуль зависит только от ФОРМЫ данных (`./types`,
 * `../types`) и от рендеров логики (`../logic`) — не от транспортов/адаптеров.
 */
import { z } from 'zod';
import { BugArtifactSchema, renderJson, renderMarkdown } from '../logic';
import { DEEP_LINK_PROMPT_LIMIT, HANDOFF_DIR, HANDOFF_PACKAGE_VERSION } from './types';
import type { AgentHandoffPackage, PackageOptions } from './types';
import type { BugArtifact, ConsoleEntry } from '../types';

// ── слаг (детерминированное имя файла/указатель) ──────────────────────────────

/** Приводит строку к kebab-виду `[a-z0-9-]`: схлопывает разделители, срезает края. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Обрезает слаг до максимума и срезает «хвостовые» дефисы, появившиеся при обрезке. */
function clampSlug(value: string, max: number): string {
  return value.slice(0, max).replace(/-+$/g, '');
}

/** Первое непустое (после `trim`) значение из списка; иначе — пустая строка. */
function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? '';
    if (trimmed !== '') return trimmed;
  }
  return '';
}

/** Хост URL (best-effort): непарсибельный адрес → пустая строка. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Короткая временна́я компонента `YYYYMMDD-HHMMSS` из ISO-времени (детерминизм имени).
 * Малопохожее на дату значение (мало цифр) → пустая строка (слаг остаётся из сути).
 */
function timeComponent(createdAt: string): string {
  const digits = createdAt.replace(/[^0-9]/g, '');
  if (digits.length < 14) return '';
  return `${digits.slice(0, 8)}-${digits.slice(8, 14)}`;
}

/**
 * Детерминированный kebab-слаг из сути артефакта (заголовок заметки → заголовок
 * страницы → хост URL) + короткой временно́й компоненты. Санитизирован до `[a-z0-9-]`,
 * с ограничением длины (~60). Никогда не пустой — фолбэк `bug-report`.
 */
export function buildSlug(artifact: BugArtifact, createdAt: string): string {
  const essence = firstNonEmpty(
    artifact.note?.title,
    artifact.meta.title,
    hostnameOf(artifact.meta.url),
  );
  const base = clampSlug(slugify(essence), 40);
  const safeBase = base === '' ? 'bug-report' : base;
  const time = timeComponent(createdAt);
  const combined = time !== '' ? `${safeBase}-${time}` : safeBase;
  return clampSlug(combined, 60);
}

// ── суть бага (краткий сигнал для промпта) ────────────────────────────────────

/** Схлопывает переносы строк в пробелы и срезает края (одна строка для промпта). */
function collapse(text: string): string {
  return text.replaceAll('\n', ' ').trim();
}

/**
 * Топ-сигнал консоли: текст первой ошибки (`error`), иначе — первого предупреждения.
 * Возвращает `undefined`, если секция консоли отсутствует или пуста. Чистая функция.
 */
export function topConsoleSignal(entries: ConsoleEntry[] | null): string | undefined {
  if (!entries) return undefined;
  const chosen =
    entries.find((e) => e.level === 'error') ?? entries.find((e) => e.level === 'warn');
  return chosen !== undefined ? collapse(chosen.text) : undefined;
}

/**
 * Строит «блок сути» компактного промпта (детерминированно, EN): заголовок бага,
 * URL, топ-сигнал консоли (если есть) и терсные счётчики секций консоли/сети
 * (только когда соответствующая секция приложена). Чистая функция — тестируема.
 */
export function buildEssence(artifact: BugArtifact): string[] {
  const title = firstNonEmpty(artifact.note?.title, artifact.meta.title);
  const lines: string[] = [
    '## Bug',
    `Title: ${title !== '' ? title : '(untitled)'}`,
    `URL: ${artifact.meta.url}`,
  ];

  const top = topConsoleSignal(artifact.console);
  if (top !== undefined) lines.push(`Top signal: ${top}`);

  if (artifact.console) {
    const errors = artifact.console.filter((e) => e.level === 'error').length;
    const warnings = artifact.console.filter((e) => e.level === 'warn').length;
    lines.push(`Console: ${String(errors)} error(s), ${String(warnings)} warning(s)`);
  }

  if (artifact.network) {
    lines.push(
      `Network: ${String(artifact.network.total)} total, ${String(artifact.network.failed)} failed`,
    );
  }

  return lines;
}

// ── компактный промпт (≤ лимита deep-link) ────────────────────────────────────

/** Вход строителя компактного промпта (всё, что нужно, без DOM/`chrome.*`). */
export interface PromptInput {
  /** Артефакт (источник сути). */
  artifact: BugArtifact;
  /** Относительный путь файла с полным отчётом (переживает усечение). */
  filePointer: string;
  /** Класть ли полный JSON в промпт (только если помещается под лимит). */
  includeJson: boolean;
  /** Готовый `renderJson(artifact)` (переиспользуется, не пересобирается). */
  fullJson: string;
}

/** Одна строка преамбулы: постановка задачи агенту (детерминированно, EN). */
const PROMPT_PREAMBLE =
  'You are an AI coding agent. Investigate and fix a browser bug captured by QAnvil.';

/**
 * Усекает промпт под лимит, честно помечая усечение и СОХРАНЯЯ указатель на файл
 * (полный контекст доступен там). Гарантирует итоговую длину `<= limit`.
 */
function truncateWithPointer(prompt: string, filePointer: string, limit: number): string {
  const notice = ` …[truncated — full context in ${filePointer}]`;
  if (notice.length >= limit) return notice.slice(0, limit);
  return prompt.slice(0, limit - notice.length) + notice;
}

/**
 * Собирает компактный агент-промпт, ГАРАНТИРОВАННО `<= limit` символов:
 *  - строка-преамбула (постановка задачи);
 *  - указатель `Full report: <filePointer>`;
 *  - блок сути (`buildEssence`);
 *  - опционально полный JSON — ТОЛЬКО если `includeJson` и он всё ещё влезает.
 * Если сборка превышает лимит — тело усекается с честной пометкой, а указатель на
 * файл переживает усечение (см. `truncateWithPointer`). Чистая функция.
 */
export function buildPromptForDeepLink(
  input: PromptInput,
  limit: number = DEEP_LINK_PROMPT_LIMIT,
): string {
  const base = [
    PROMPT_PREAMBLE,
    `Full report: ${input.filePointer}`,
    '',
    ...buildEssence(input.artifact),
  ].join('\n');

  let prompt = base;
  if (input.includeJson) {
    const withJson = `${base}\n\n## Full JSON\n${input.fullJson}`;
    if (withJson.length <= limit) prompt = withJson;
  }

  if (prompt.length <= limit) return prompt;
  return truncateWithPointer(prompt, input.filePointer, limit);
}

// ── сборка пакета ─────────────────────────────────────────────────────────────

/**
 * Собирает `AgentHandoffPackage` из артефакта и опций (детерминированно, чисто).
 * Полный Markdown/JSON — через рендеры `../logic`; компактный промпт — через
 * `buildPromptForDeepLink`. Указатель на файл по умолчанию — `${HANDOFF_DIR}/latest.md`.
 */
export function buildHandoffPackage(
  artifact: BugArtifact,
  opts: PackageOptions,
): AgentHandoffPackage {
  const fullMarkdown = renderMarkdown(artifact);
  const fullJson = renderJson(artifact);
  const filePointer = opts.filePointer ?? `${HANDOFF_DIR}/latest.md`;
  const compactPrompt = buildPromptForDeepLink(
    {
      artifact,
      filePointer,
      includeJson: opts.includeJson ?? false,
      fullJson,
    },
    opts.promptLimit ?? DEEP_LINK_PROMPT_LIMIT,
  );

  return {
    packageVersion: HANDOFF_PACKAGE_VERSION,
    createdAt: opts.createdAt,
    slug: buildSlug(artifact, opts.createdAt),
    fullMarkdown,
    fullJson,
    compactPrompt,
    artifact,
  };
}

// ── zod-схема пакета (граница/канон формы) ────────────────────────────────────

/**
 * Схема формы `AgentHandoffPackage`: литерал версии + строковые поля + вложенный
 * `BugArtifactSchema` (переиспользуется из `../logic`). Зеркалит паттерн
 * `BugArtifactSchema` в `logic.ts`.
 */
export const AgentHandoffPackageSchema: z.ZodType<AgentHandoffPackage> = z.object({
  packageVersion: z.literal(HANDOFF_PACKAGE_VERSION),
  createdAt: z.string(),
  slug: z.string(),
  fullMarkdown: z.string(),
  fullJson: z.string(),
  compactPrompt: z.string(),
  artifact: BugArtifactSchema,
}) as z.ZodType<AgentHandoffPackage>;

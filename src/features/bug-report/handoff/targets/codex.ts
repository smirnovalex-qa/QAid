/**
 * Адаптер адресата «Codex» для Agent Handoff (TASK-045, поверх ядра TASK-040).
 *
 * Codex-схема `codex://` — НОВАЯ и эволюционирующая: детектировать регистрацию схемы
 * из браузера нельзя (ADR-0043), поэтому deep-link открывается ОПТИМИСТИЧНО как основной
 * путь, а фолбэк («не открылось? — вот команда/промпт») показывается ВСЕГДА. Схема
 * `codex://new?prompt=<encoded>` открывает Codex с уже вставленным промптом; полный
 * контекст лежит в файле проекта (FSA), на который промпт ссылается.
 *
 * Инвариант расширяемости §1: файл не импортирует внутренности соседних адаптеров —
 * только контракт `../types`, чистый строитель `../deep-link` и реестр `../targets`.
 * Формат схемы ИЗОЛИРОВАН в константах ниже + `buildCodexDeepLink`, чтобы будущая правка
 * формата (он ещё меняется) была однострочной.
 *
 * i18n: адресат только РЕФЕРЕНСИТ ключи (через `ctx.t(key)` и `titleKey`) — сам ничего в
 * каталоги не кладёт (это делает оркестратор). Ключи, используемые этим файлом:
 *   `bugReport.handoff.target.codex`
 *   `bugReport.handoff.codex.opened`
 *   `bugReport.handoff.msg.deepLinkFailed`
 *   `bugReport.handoff.fallback.copyCommand`
 *   `bugReport.handoff.fallback.copyPrompt`
 *   `bugReport.handoff.fallback.copyFull`
 */
import type { Result } from '@/shared/result';
import { buildDeepLink } from '../deep-link';
import { writeArtifactForHandoff } from '../delivery';
import { registerHandoffTarget } from '../targets';
import type {
  AgentHandoffPackage,
  DeepLinkError,
  DeepLinkOk,
  DeliveryContext,
  DeliveryResult,
  HandoffFallback,
  HandoffTarget,
} from '../types';

// ── изоляция формата схемы (единая точка правки — формат ещё эволюционирует) ─────────
//
// ВАЖНО: сверить актуальный формат `codex://` на момент реализации — схема новая и
// меняется. Всё, что касается формы deep-link, живёт ТОЛЬКО здесь и в `buildCodexDeepLink`.

/** Схема Codex без `://`. */
const CODEX_SCHEME = 'codex';
/** Путь «новая сессия»: `codex://new`. */
const CODEX_NEW_PATH = 'new';
/** Имя query-параметра, несущего промпт. */
const CODEX_PROMPT_PARAM = 'prompt';

// ── чистые помощники (без DOM/`chrome.*`) ────────────────────────────────────────────

/** Вход для сборки Codex deep-link (чистый, тестируется без браузера). */
interface CodexDeepLinkInput {
  /** Пакет для агента (несёт компактный промпт со ссылкой на файл). */
  pkg: AgentHandoffPackage;
  /** Лимит промпта (после URL-encode) — как у Claude Code, консервативный. */
  promptLimit: number;
  /** Относительный путь файла с полным контекстом (для пометки усечения). */
  filePointer: string;
}

/**
 * Собирает `codex://new?prompt=<encoded>` через общий строитель. Таргет (`repo`/`cwd`) НЕ
 * передаётся: `codex://new` несёт промпт инлайн, а полный контекст даёт файл (`filePointer`).
 * Лимит гарантируется усечением по энкоженой длине (см. `buildDeepLink`); ошибки — данными.
 */
export const buildCodexDeepLink = (input: CodexDeepLinkInput): Result<DeepLinkOk, DeepLinkError> =>
  buildDeepLink({
    scheme: CODEX_SCHEME,
    path: CODEX_NEW_PATH,
    prompt: input.pkg.compactPrompt,
    promptParam: CODEX_PROMPT_PARAM,
    limit: input.promptLimit,
    filePointer: input.filePointer,
  });

/**
 * Неинтерактивная команда-фолбэк: скармливает Codex полный отчёт из файла проекта.
 * Формат изолирован здесь на случай смены CLI-контракта Codex.
 */
export const codexCommand = (filePointer: string): string => `codex "$(cat ${filePointer})"`;

// ── адресат ──────────────────────────────────────────────────────────────────────────

/**
 * Адресат «Codex». Порядок доставки: (1) если есть FSA — пишем полный артефакт в проект и
 * берём его путь как указатель; (2) собираем deep-link (чистый); (3) фолбэки предлагаются
 * ВСЕГДА (копировать команду / промпт / полный отчёт) — открытие схемы недетектируемо;
 * (4) при неудаче сборки — честное сообщение без открытия; (5) иначе — оптимистичное
 * открытие `codex://new`.
 */
const codexTarget: HandoffTarget = {
  id: 'codex',
  titleKey: 'bugReport.handoff.target.codex',
  preferredTransport: 'deep-link',
  order: 4,
  async deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
    // (1) Пишем полный артефакт в проект и классифицируем исход. Файл — предпосылка
    // осмысленности deep-link: `codex://new?prompt=` ссылается на `latest.md`.
    const write = await writeArtifactForHandoff(ctx);
    const { filePath, filePointer } = write;

    // (2) Фолбэки — всегда, в фиксированном порядке (команда → промпт → полный отчёт).
    const fallbacks: HandoffFallback[] = [
      {
        label: ctx.t('bugReport.handoff.fallback.copyCommand'),
        run: async () => {
          await ctx.transports.copyToClipboard(codexCommand(filePointer));
        },
      },
      {
        label: ctx.t('bugReport.handoff.fallback.copyPrompt'),
        run: async () => {
          await ctx.transports.copyToClipboard(ctx.pkg.compactPrompt);
        },
      },
      {
        label: ctx.t('bugReport.handoff.fallback.copyFull'),
        run: async () => {
          await ctx.transports.copyToClipboard(ctx.pkg.fullMarkdown);
        },
      },
    ];

    // (3) Файл не записан (папка не выбрана / нет доступа / FSA нет) — не открываем
    // Codex на несуществующий `latest.md`, честно показываем причину + фолбэки.
    if (write.reasonKey !== undefined) {
      return { ok: false, usedTransport: 'none', message: ctx.t(write.reasonKey), fallbacks };
    }

    // (4) Сборка deep-link (чистая; лимит — из настроек, как у Claude Code).
    const built = buildCodexDeepLink({
      pkg: ctx.pkg,
      promptLimit: ctx.settings.promptLimit,
      filePointer,
    });

    // (5) Сборка не удалась — сообщаем честно, без открытия (схема фиксирована и валидна,
    // ветка оборонительная; ошибки строителя всегда приходят данными, а не throw).
    if (!built.ok) {
      return {
        ok: false,
        usedTransport: 'fs-access',
        message: ctx.t('bugReport.handoff.msg.deepLinkFailed'),
        fallbacks,
        ...(filePath !== undefined ? { filePath } : {}),
      };
    }

    // (6) Оптимистичное открытие `codex://new` под пользовательским жестом.
    ctx.transports.openDeepLink(built.value.url);
    return {
      ok: true,
      usedTransport: 'deep-link',
      message: ctx.t('bugReport.handoff.codex.opened'),
      fallbacks,
      ...(filePath !== undefined ? { filePath } : {}),
    };
  },
};

// Регистрируется при загрузке модуля (как фичи в `features/registry.ts`).
registerHandoffTarget(codexTarget);

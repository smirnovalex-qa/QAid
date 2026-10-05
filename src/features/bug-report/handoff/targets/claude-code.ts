/**
 * Адаптер адресата «Claude Code» для Agent Handoff (TASK-043). Пишется ПОВЕРХ ядра
 * TASK-040 (`../types`, `../deep-link`, `../targets`) и не импортирует внутренности
 * соседних адаптеров (`cursor`/`codex`) — инвариант расширяемости §1.
 *
 * Claude Code (v2.1.91+) регистрирует обработчик схемы `claude-cli://` САМ при первом
 * интерактивном запуске — без отдельной установки. Deep-link открывает терминал в нужной
 * папке с УЖЕ ВПЕЧАТАННЫМ промптом; отправку (Enter) агент оставляет пользователю (by
 * design — так безопаснее). Лимит `q` — 5 000 символов, поэтому полный артефакт уходит в
 * файл (`${HANDOFF_DIR}/latest.md` через File System Access), а в `q` идёт компактный
 * промпт-указатель (см. ADR-0043).
 *
 * ПОЧЕМУ ТРИ АДРЕСАТА, А НЕ СКРЫТЫЙ ПЕРЕКЛЮЧАТЕЛЬ: у Claude Code три равноправных входа —
 * терминал (`claude-cli://open`), вкладка VS Code (`vscode://anthropic.claude-code/open`)
 * и десктоп-приложение Claude (`claude://code/new` — вкладка Code в GUI, БЕЗ терминала).
 * Явные записи в селекте честнее спрятанного тумблера: пользователь видит все пути и
 * выбирает осознанно. Схема/путь каждого варианта изолированы в одной константе ниже —
 * будущая смена формата ссылки правится одной строкой.
 *
 * ЗАЧЕМ ВАРИАНТ DESKTOP (аналог Codex `codex://new`): путь `claude://` открывает GUI-
 * приложение Claude, а не терминальный лаунчер Windows (`wt.exe -d …`), — значит НЕТ
 * зависимости от Windows Terminal и НЕТ «окно мелькнуло и закрылось» на Win10 (см.
 * [[handoff-fsa-constraints]] п.4). Рабочая папка приходит ТОЛЬКО из абсолютного `folder`
 * (наш `cwd`); `repo`-слаг схемой `claude://code/new` не поддерживается (параметры:
 * `q`/`prompt`, `folder`, `file` — support.claude.com/.../open-claude-desktop-with-a-link).
 * Лимит `q` у десктопа выше (~14 000), но мы держим общий консервативный лимит из настроек.
 *
 * i18n: адаптер только РЕФЕРЕНСИТ ключи (через `ctx.t(key)` и `titleKey`) — сам ничего в
 * каталоги не кладёт (это делает оркестратор, TASK-040). Используемые ключи:
 *   `bugReport.handoff.target.claudeCode`
 *   `bugReport.handoff.target.claudeCodeVscode`
 *   `bugReport.handoff.target.claudeCodeDesktop`
 *   `bugReport.handoff.claudeCode.opened`
 *   `bugReport.handoff.claudeCode.openedVscode`
 *   `bugReport.handoff.claudeCode.openedDesktop`
 *   `bugReport.handoff.claudeCode.openedNoTarget` (открыли, но невалидный необязательный
 *      `repo`/`cwd` отброшен — неблокирующее предупреждение «поправьте поле для in-project»)
 *   `bugReport.handoff.claudeCode.needTarget` (резерв: подсказка «задать repo/cwd» —
 *      surface-ит оркестратор; сам адаптер открывает оптимистично и не блокирует)
 *   `bugReport.handoff.msg.deepLinkFailed`
 *   `bugReport.handoff.fallback.copyPrompt`
 *   `bugReport.handoff.fallback.copyFull`
 *   `bugReport.handoff.fallback.copyCommand`
 *   `bugReport.handoff.fallback.copyFilePath`
 */
import type { Result } from '@/shared/result';
import { buildDeepLink, validateCwd } from '../deep-link';
import { writeArtifactForHandoff } from '../delivery';
import { registerHandoffTarget } from '../targets';
import type {
  AgentHandoffPackage,
  DeepLinkError,
  DeepLinkOk,
  DeepLinkSpec,
  DeliveryContext,
  DeliveryResult,
  HandoffFallback,
  HandoffTarget,
  ProjectTarget,
} from '../types';

// ── идентификаторы адресатов ────────────────────────────────────────────────────

/** id терминального адресата (`claude-cli://`). */
const TERMINAL_ID = 'claude-code';
/** id VS-Code-варианта (`vscode://anthropic.claude-code/open`). */
const VSCODE_ID = 'claude-code-vscode';
/** id варианта десктоп-приложения Claude (`claude://code/new`). */
const DESKTOP_ID = 'claude-code-desktop';

/** Вход Claude Code: терминал / вкладка VS Code / десктоп-приложение. */
export type ClaudeVariant = 'terminal' | 'vscode' | 'desktop';

/**
 * Схема/путь deep-link, изолированные в одном месте: смена формата ссылки (напр., если
 * Claude Code поменяет путь VS-Code-обработчика) — правка одной строки. `promptParam`
 * у всех — `q` (для VS-Code- и desktop-вариантов — best-effort, форма может измениться).
 */
const LINK: Record<ClaudeVariant, { scheme: string; path: string }> = {
  terminal: { scheme: 'claude-cli', path: 'open' },
  vscode: { scheme: 'vscode', path: 'anthropic.claude-code/open' },
  desktop: { scheme: 'claude', path: 'code/new' },
};

/** id адресата → вариант ссылки (единая точка соответствия). */
const variantOf = (id: string): ClaudeVariant => {
  if (id === VSCODE_ID) return 'vscode';
  if (id === DESKTOP_ID) return 'desktop';
  return 'terminal';
};

/** Имя query-параметра промпта у всех вариантов. */
const PROMPT_PARAM = 'q';

/** Имя query-параметра рабочей папки у desktop-схемы (`claude://code/new`). */
const DESKTOP_FOLDER_PARAM = 'folder';

// ── чистые помощники (без DOM/chrome) ────────────────────────────────────────────

/** Вход чистого строителя deep-link Claude Code. */
export interface ClaudeDeepLinkInput {
  /** Пакет для агента (источник компактного промпта). */
  pkg: AgentHandoffPackage;
  /** Таргет проекта из настроек (repo/cwd, любое поле может быть пустым). */
  project: ProjectTarget;
  /** Лимит компактного промпта (после URL-encode). */
  promptLimit: number;
  /** Относительный путь файла для пометки усечения («полный контекст — в файле …»). */
  filePointer: string;
  /** Какой вход собирать: терминал / вкладка VS Code / десктоп-приложение. */
  variant: ClaudeVariant;
}

/** Непустое значение после trim, иначе `undefined` (отбрасываем пустые repo/cwd). */
const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Строит `ProjectTarget` для ссылки: `repo` ПРЕДПОЧТИТЕЛЬНЕЕ `cwd`, когда заданы оба —
 * Claude Code резолвит слаг в локальный клон (переносимее абсолютного пути). Если оба
 * поля пусты — возвращает `undefined`, чтобы `target` вовсе не попал в spec и ссылка
 * открылась с инлайновым промптом (без параметров repo/cwd).
 */
const pickTarget = (project: ProjectTarget): ProjectTarget | undefined => {
  const repo = nonEmpty(project.repo);
  if (repo !== undefined) return { repo };
  const cwd = nonEmpty(project.cwd);
  if (cwd !== undefined) return { cwd };
  return undefined;
};

/**
 * Чистый строитель deep-link Claude Code: собирает `DeepLinkSpec` с нужной схемой/путём,
 * компактным промптом, лимитом и указателем на файл. Возвращает результат общего
 * `buildDeepLink` (валидация схемы/repo/cwd и гарантия лимита — там; ошибки — данными).
 *
 * Терминал/VS Code адресуют проект через `repo`/`cwd` (`target`, добавляется ТОЛЬКО при
 * непустом значении). Desktop-схема (`claude://code/new`) использует ОТДЕЛЬНЫЙ параметр
 * `folder` (абсолютный путь) и НЕ понимает `repo` — поэтому туда идёт лишь валидный
 * абсолютный `cwd` (через `extraParams`), а непустой-но-невалидный `cwd` возвращается
 * ошибкой `invalid-cwd` (её ловит деградация в `makeDeliver`: таргет отбросим и откроем
 * без папки). Пустой `cwd`/только `repo` для desktop → просто без `folder` (композер
 * откроется в дефолтной/последней папке — приемлемо, промпт всё равно ссылается на файл).
 */
export const buildClaudeDeepLink = (
  input: ClaudeDeepLinkInput,
): Result<DeepLinkOk, DeepLinkError> => {
  const { scheme, path } = LINK[input.variant];
  const base = {
    scheme,
    path,
    prompt: input.pkg.compactPrompt,
    promptParam: PROMPT_PARAM,
    limit: input.promptLimit,
    filePointer: input.filePointer,
  } satisfies Omit<DeepLinkSpec, 'target' | 'extraParams'>;

  if (input.variant === 'desktop') {
    const folder = nonEmpty(input.project.cwd);
    if (folder !== undefined) {
      const cwdResult = validateCwd(folder);
      if (!cwdResult.ok) return cwdResult; // present-but-invalid → degrade in makeDeliver
    }
    const spec: DeepLinkSpec = {
      ...base,
      ...(folder !== undefined ? { extraParams: { [DESKTOP_FOLDER_PARAM]: folder } } : {}),
    };
    return buildDeepLink(spec);
  }

  const target = pickTarget(input.project);
  const spec: DeepLinkSpec = {
    ...base,
    ...(target !== undefined ? { target } : {}),
  };
  return buildDeepLink(spec);
};

/**
 * Fallback-команда: запускает `claude`, ссылаясь на файл артефакта через `@`-упоминание
 * (Claude Code сам прочитает файл). ПОРТАТИВНА по шеллам: это просто строковый аргумент,
 * без подстановок. Прежняя форма `claude "$(cat …)"` была bash-only и падала в
 * PowerShell/cmd — а именно их Claude Code открывает на Windows (Windows Terminal →
 * PowerShell → cmd), из-за чего фолбэк не работал ровно там, где он нужнее всего.
 * Пользователь копирует команду и запускает из КОРНЯ проекта (где лежит `@`-путь).
 */
export const claudeCommand = (filePointer: string): string => `claude "@${filePointer}"`;

/**
 * Ошибка сборки относится к ОПЦИОНАЛЬНОМУ таргету проекта (`repo`/`cwd`), а не к самой
 * схеме. Таргет — необязателен: `claude-cli://open?q=…` открывается и без него (промпт
 * уже ссылается на записанный файл). Поэтому такие ошибки не фатальны — таргет отбрасываем
 * и открываем агента без него, предупредив пользователя. Фатальна лишь `invalid-scheme`
 * (схема захардкожена валидной — ветка оборонительная).
 */
const isProjectTargetError = (error: DeepLinkError): boolean =>
  error.kind === 'invalid-repo' || error.kind === 'invalid-cwd' || error.kind === 'no-target';

/** i18n-ключ сообщения об успешном открытии (терминал / VS Code / desktop / без таргета). */
const openedMessageKey = (variant: ClaudeVariant, targetIgnored: boolean): string => {
  if (targetIgnored) return 'bugReport.handoff.claudeCode.openedNoTarget';
  switch (variant) {
    case 'vscode':
      return 'bugReport.handoff.claudeCode.openedVscode';
    case 'desktop':
      return 'bugReport.handoff.claudeCode.openedDesktop';
    case 'terminal':
      return 'bugReport.handoff.claudeCode.opened';
  }
};

// ── доставка (общая для обоих вариантов) ────────────────────────────────────────

/**
 * Собирает `deliver` для конкретного id (терминал/VS Code). Порядок деградации без
 * тупиков: (1) записать полный артефакт в проект и классифицировать исход (файл —
 * предпосылка осмысленности deep-link: `q` ссылается на `latest.md`); (2) фолбэки
 * ВСЕГДА; (3) файл не записан → честная причина, НЕ открываем агента на несуществующий
 * файл; (4) собрать deep-link; (5) сбой сборки → сообщение об ошибке + фолбэки; (6)
 * иначе оптимистично открыть ссылку (регистрацию схемы из браузера не проверить).
 * `filePath` в результат — через условный spread (exactOptionalPropertyTypes).
 */
const makeDeliver =
  (id: string) =>
  async (ctx: DeliveryContext): Promise<DeliveryResult> => {
    const variant = variantOf(id);

    // (1) Пишем полный артефакт в проект и классифицируем исход (общий помощник).
    const write = await writeArtifactForHandoff(ctx);
    const { filePath, filePointer } = write;

    // (2) фолбэки — всегда: копировать промпт → полный → команду → `@путь`.
    const fallbacks: HandoffFallback[] = [
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
      {
        label: ctx.t('bugReport.handoff.fallback.copyCommand'),
        run: async () => {
          await ctx.transports.copyToClipboard(claudeCommand(filePointer));
        },
      },
      {
        label: ctx.t('bugReport.handoff.fallback.copyFilePath'),
        run: async () => {
          await ctx.transports.copyToClipboard(`@${filePointer}`);
        },
      },
    ];

    // (3) Файл записать НЕ удалось (папка не выбрана / нет доступа / FSA нет) — не
    // открываем агента на несуществующий `latest.md`, а честно показываем причину и
    // фолбэки. Пользователь выбирает папку проекта и повторяет отправку.
    if (write.reasonKey !== undefined) {
      return { ok: false, usedTransport: 'none', message: ctx.t(write.reasonKey), fallbacks };
    }

    // (4) deep-link (чистый строитель) — файл на месте. Сперва пробуем с таргетом проекта.
    let link = buildClaudeDeepLink({
      pkg: ctx.pkg,
      project: ctx.project,
      promptLimit: ctx.settings.promptLimit,
      filePointer,
      variant,
    });

    // (4b) Таргет проекта (`repo`/`cwd`) — ОПЦИОНАЛЬНЫЙ: его невалидность НЕ должна
    // делать основной путь (открыть Claude Code) недоступным. Промпт уже ссылается на
    // записанный файл, поэтому при ошибке таргета отбрасываем его и пересобираем ссылку
    // без него (scheme-only собирается всегда), а пользователя предупреждаем неблокирующе
    // — он поправит поле, чтобы агент открылся именно «в проекте». Это устраняет прежний
    // тупик: одно кривое значение в необязательном поле рушило всю отправку в Claude Code.
    let targetIgnored = false;
    if (!link.ok && isProjectTargetError(link.error)) {
      link = buildClaudeDeepLink({
        pkg: ctx.pkg,
        project: {},
        promptLimit: ctx.settings.promptLimit,
        filePointer,
        variant,
      });
      targetIgnored = true;
    }

    // (5) Фатальна лишь не-таргетная ошибка сборки (напр. `invalid-scheme`) — честная
    // ошибка + фолбэки. Недостижимо при фиксированной валидной схеме (оборонительно).
    if (!link.ok) {
      return {
        ok: false,
        usedTransport: 'fs-access',
        message: ctx.t('bugReport.handoff.msg.deepLinkFailed'),
        fallbacks,
        ...(filePath !== undefined ? { filePath } : {}),
      };
    }

    // (6) оптимистично открываем ссылку (детекта регистрации схемы нет — фолбэки рядом).
    ctx.transports.openDeepLink(link.value.url);
    return {
      ok: true,
      usedTransport: 'deep-link',
      message: ctx.t(openedMessageKey(variant, targetIgnored)),
      fallbacks,
      ...(filePath !== undefined ? { filePath } : {}),
    };
  };

// ── адресаты ─────────────────────────────────────────────────────────────────────

/** Терминальный адресат Claude Code (`claude-cli://open`). */
const claudeCodeTarget: HandoffTarget = {
  id: TERMINAL_ID,
  titleKey: 'bugReport.handoff.target.claudeCode',
  preferredTransport: 'deep-link',
  order: 1,
  deliver: makeDeliver(TERMINAL_ID),
};

/**
 * Вариант «десктоп-приложение Claude» (`claude://code/new`) — открывает вкладку Code в GUI
 * без терминала (аналог Codex). Идёт вторым: на Windows это самый надёжный путь (не зависит
 * от Windows Terminal и не «мелькает» при несуществующем cwd).
 */
const claudeCodeDesktopTarget: HandoffTarget = {
  id: DESKTOP_ID,
  titleKey: 'bugReport.handoff.target.claudeCodeDesktop',
  preferredTransport: 'deep-link',
  order: 2,
  deliver: makeDeliver(DESKTOP_ID),
};

/** Вариант «открыть в VS Code» (`vscode://anthropic.claude-code/open`). */
const claudeCodeVscodeTarget: HandoffTarget = {
  id: VSCODE_ID,
  titleKey: 'bugReport.handoff.target.claudeCodeVscode',
  preferredTransport: 'deep-link',
  order: 3,
  deliver: makeDeliver(VSCODE_ID),
};

// Регистрируются при загрузке модуля (как фичи в `features/registry.ts`).
registerHandoffTarget(claudeCodeTarget);
registerHandoffTarget(claudeCodeDesktopTarget);
registerHandoffTarget(claudeCodeVscodeTarget);

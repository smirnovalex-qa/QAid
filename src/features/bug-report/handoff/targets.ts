/**
 * Реестр адресатов Agent Handoff + два базовых тул-независимых адресата (TASK-040).
 *
 * По образцу `features/registry.ts`: модульная `Map`, `registerHandoffTarget`
 * бросает на дубликат id, `getHandoffTargets` отдаёт детерминированный порядок
 * (по `order`, затем по id). Тул-специфичные адресаты (`claude-code`/`cursor`/
 * `codex`) регистрируются поверх — в адаптерах TASK-043/044/045; здесь только
 * тул-независимая база: буфер обмена и папка проекта.
 *
 * i18n: адресат только РЕФЕРЕНСИТ ключи (через `ctx.t(key)` и `titleKey`) — сам
 * ничего в каталоги не кладёт (это делает оркестратор). Полный список ключей,
 * используемых этим файлом:
 *   `bugReport.handoff.target.clipboard`
 *   `bugReport.handoff.target.projectFolder`
 *   `bugReport.handoff.msg.copied`
 *   `bugReport.handoff.msg.copyFailed`
 *   `bugReport.handoff.msg.fsUnavailable`
 *   `bugReport.handoff.msg.written`
 *   `bugReport.handoff.fallback.copyFull`
 *   `bugReport.handoff.fallback.copyPrompt`
 * (ключи причин записи FSA — `bugReport.handoff.fs.*` — возвращает транспорт;
 *  адресат прокидывает их как сообщение.)
 */
import type { DeliveryContext, DeliveryResult, HandoffTarget } from './types';

const registry = new Map<string, HandoffTarget>();

/** Регистрирует адресат. Бросает на дубликат id (зеркало `registerFeature`). */
export function registerHandoffTarget(target: HandoffTarget): void {
  if (registry.has(target.id)) throw new Error(`duplicate handoff target: ${target.id}`);
  registry.set(target.id, target);
}

/** Все адресаты в детерминированном порядке: по `order` (asc), затем по id. */
export function getHandoffTargets(): HandoffTarget[] {
  return [...registry.values()].sort((a, b) => {
    const byOrder = (a.order ?? 0) - (b.order ?? 0);
    return byOrder !== 0 ? byOrder : a.id.localeCompare(b.id);
  });
}

/**
 * Адресат «буфер обмена». Копирует ПОЛНЫЙ Markdown, а не компактный промпт:
 * назначение этого адресата — отдать пользователю ВЕСЬ артефакт для ручной вставки
 * (компактный промпт — это указатель на файл, у него есть путь через FSA-адресат),
 * поэтому `includeJson` тут не переключает источник.
 */
const clipboardTarget: HandoffTarget = {
  id: 'clipboard',
  titleKey: 'bugReport.handoff.target.clipboard',
  preferredTransport: 'clipboard',
  order: 10,
  async deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
    const ok = await ctx.transports.copyToClipboard(ctx.pkg.fullMarkdown);
    if (ok) {
      return {
        ok: true,
        usedTransport: 'clipboard',
        message: ctx.t('bugReport.handoff.msg.copied'),
        fallbacks: [],
      };
    }
    return {
      ok: false,
      usedTransport: 'clipboard',
      message: ctx.t('bugReport.handoff.msg.copyFailed'),
      fallbacks: [
        {
          label: ctx.t('bugReport.handoff.fallback.copyFull'),
          run: async () => {
            await ctx.transports.copyToClipboard(ctx.pkg.fullMarkdown);
          },
        },
      ],
    };
  },
};

/**
 * Адресат «папка проекта» (FSA). Если API нет — честно сообщает недоступность и
 * предлагает фолбэк «скопировать полный отчёт». Иначе пишет файлы в проект; на
 * успехе даёт путь и фолбэк «скопировать компактный промпт» (вставить агенту),
 * на сбое — сообщение = вернувшийся i18n-ключ причины + фолбэк «скопировать полный».
 */
const projectFolderTarget: HandoffTarget = {
  id: 'project-folder',
  titleKey: 'bugReport.handoff.target.projectFolder',
  preferredTransport: 'fs-access',
  order: 20,
  async deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
    const copyFullFallback = {
      label: ctx.t('bugReport.handoff.fallback.copyFull'),
      run: async () => {
        await ctx.transports.copyToClipboard(ctx.pkg.fullMarkdown);
      },
    };

    if (!ctx.capabilities.fsAccess) {
      return {
        ok: false,
        usedTransport: 'none',
        message: ctx.t('bugReport.handoff.msg.fsUnavailable'),
        fallbacks: [copyFullFallback],
      };
    }

    const result = await ctx.transports.writeProjectFiles(ctx.pkg);
    if (result.ok) {
      return {
        ok: true,
        usedTransport: 'fs-access',
        message: ctx.t('bugReport.handoff.msg.written', { path: result.latestPath }),
        filePath: result.latestPath,
        fallbacks: [
          {
            label: ctx.t('bugReport.handoff.fallback.copyPrompt'),
            run: async () => {
              await ctx.transports.copyToClipboard(ctx.pkg.compactPrompt);
            },
          },
        ],
      };
    }

    return {
      ok: false,
      usedTransport: 'fs-access',
      message: ctx.t(result.error ?? 'bugReport.handoff.fs.failed'),
      fallbacks: [copyFullFallback],
    };
  },
};

// Базовые адресаты регистрируются при загрузке модуля (как фичи в `registry.ts`).
registerHandoffTarget(clipboardTarget);
registerHandoffTarget(projectFolderTarget);

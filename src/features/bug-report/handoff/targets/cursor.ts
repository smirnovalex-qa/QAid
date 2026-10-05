/**
 * Адаптер адресата «Cursor» для Agent Handoff (TASK-044). Регистрируется поверх ядра
 * (`../types` + `../targets`), внутренности соседних адаптеров не импортирует
 * (инвариант расширяемости §1). Чистая логika линка вынесена в `buildCursorFileLink`
 * и покрыта юнит-тестами без DOM/`chrome.*`; `deliver()` тестируется на фейках.
 *
 * Ключевое проектное решение (из задачи): чат-промпт-deeplink Cursor НЕСТАБИЛЕН и
 * зависит от версии — на него опираться НЕЛЬЗЯ. Надёжный путь — ОТКРЫТЬ ФАЙЛ ОТЧЁТА в
 * Cursor через `cursor://file/<абсолютный-путь>`, а полный контекст пользователь
 * подтягивает файлом (FSA) и `@file` в Cursor Chat. Схема `cursor://file` требует
 * АБСОЛЮТНЫЙ путь, которого FSA-handle не раскрывает, — поэтому берём его из `cwd`
 * таргета проекта (абсолютный путь, заданный пользователем один раз в настройках).
 * Буфер обмена + `@file` — всегда доступный фолбэк (открытие оптимистично, без детекта).
 *
 * i18n: адресат только РЕФЕРЕНСИТ ключи (через `ctx.t(key)` и `titleKey`) — сам ничего
 * в каталоги не кладёт. Полный список используемых ключей:
 *   `bugReport.handoff.target.cursor`
 *   `bugReport.handoff.cursor.opened`
 *   `bugReport.handoff.cursor.needPath`
 *   `bugReport.handoff.fallback.copyFull`
 *   `bugReport.handoff.fallback.copyFilePath`
 *   `bugReport.handoff.fallback.copyPrompt`
 */
import { err, ok, type Result } from '@/shared/result';
import { validateCwd } from '../deep-link';
import { writeArtifactForHandoff } from '../delivery';
import { registerHandoffTarget } from '../targets';
import type { DeliveryContext, DeliveryResult, HandoffFallback, HandoffTarget } from '../types';

/**
 * Экспериментальный чат-промпт-deeplink Cursor выключен намеренно: схема нестабильна и
 * версионно-зависима, путь открытия файла НИКОГДА от неё не зависит. Флаг оставлен как
 * задокументированная точка расширения — включать его без стабилизации схемы нельзя.
 */
export const EXPERIMENTAL_PROMPT_DEEPLINK = false as const;

/** Причина, по которой не удалось собрать `cursor://file`-линк (данными, не throw). */
export interface CursorLinkError {
  kind: 'invalid-cwd' | 'no-cwd';
  detail: string;
}

/** Успех сборки линка. */
export interface CursorLinkOk {
  /** Готовый `cursor://file/<абсолютный-путь>` для открытия под жестом. */
  url: string;
}

/** Заменяет обратные слэши на прямые (единый вид для URL-пути). */
const toForwardSlashes = (value: string): string => value.replace(/\\/g, '/');

/**
 * Собирает `cursor://file/<абсолютный-путь>` из абсолютного `cwd` и относительного
 * `relPath`. Чистая функция без DOM/`chrome.*`.
 *
 * — Пустой `cwd` → `no-cwd` (FSA не раскрывает абсолютный путь; его задаёт пользователь).
 * — `cwd` не проходит проверку безопасности (`..`/UNC/control/bidi/не абсолютный) →
 *   `invalid-cwd` (переиспользуем `validateCwd` из общего строителя deep-link).
 * — Иначе склеиваем `cwd` + `/` + `relPath`, нормализуя разделители (без дублирования
 *   сепаратора; поддержаны POSIX `/` и Windows `\`/`C:`). Путь энкодим `encodeURI`
 *   (слэши/`:` остаются читаемыми), для POSIX ведущий `/` становится разделителем после
 *   `file`, для Windows-диска ведущий `/` добавляется (`cursor://file/C:/...`).
 */
export const buildCursorFileLink = (input: {
  cwd: string;
  relPath: string;
}): Result<CursorLinkOk, CursorLinkError> => {
  if (input.cwd.length === 0) return err({ kind: 'no-cwd', detail: 'cwd is empty' });

  const cwdValid = validateCwd(input.cwd);
  if (!cwdValid.ok) return err({ kind: 'invalid-cwd', detail: cwdValid.error.detail });

  const base = toForwardSlashes(input.cwd).replace(/\/+$/, '');
  const rel = toForwardSlashes(input.relPath).replace(/^\/+/, '');
  const absPath = `${base}/${rel}`;

  const encoded = encodeURI(absPath);
  const withLead = encoded.startsWith('/') ? encoded : `/${encoded}`;

  return ok({ url: `cursor://file${withLead}` });
};

/**
 * Адресат «Cursor». Предпочитаемый транспорт — deep-link (открытие файла отчёта);
 * порядок `3` (после тул-независимой базы и других адаптеров по их номерам задач).
 */
const cursorTarget: HandoffTarget = {
  id: 'cursor',
  titleKey: 'bugReport.handoff.target.cursor',
  preferredTransport: 'deep-link',
  order: 3,
  async deliver(ctx: DeliveryContext): Promise<DeliveryResult> {
    // 1. Пишем полный артефакт в проект и классифицируем исход. Cursor ОТКРЫВАЕТ файл
    // отчёта — без записанного файла открывать `cursor://file` некуда.
    const write = await writeArtifactForHandoff(ctx);
    const relPath = write.filePointer;

    // 2. Фолбэки предлагаются ВСЕГДА (открытие оптимистично, детекта схемы нет).
    const fallbacks: HandoffFallback[] = [
      {
        label: ctx.t('bugReport.handoff.fallback.copyFull'),
        run: async () => {
          await ctx.transports.copyToClipboard(ctx.pkg.fullMarkdown);
        },
      },
      {
        label: ctx.t('bugReport.handoff.fallback.copyFilePath'),
        run: async () => {
          await ctx.transports.copyToClipboard(`@${relPath}`);
        },
      },
      {
        label: ctx.t('bugReport.handoff.fallback.copyPrompt'),
        run: async () => {
          await ctx.transports.copyToClipboard(ctx.pkg.compactPrompt);
        },
      },
    ];

    // 3. Файл не записан (папка не выбрана / нет доступа / FSA нет) — открывать нечего,
    // честно показываем причину + фолбэки (`@file` заработает после выбора папки).
    if (write.reasonKey !== undefined) {
      return { ok: false, usedTransport: 'none', message: ctx.t(write.reasonKey), fallbacks };
    }

    // 4. Собираем линк открытия файла из абсолютного cwd таргета + относительного пути.
    const link = buildCursorFileLink({ cwd: ctx.project.cwd ?? '', relPath });

    // 5. Линк не собрался (нет/невалиден cwd): файл записан — `@file` фолбэк рабочий.
    if (!link.ok) {
      return {
        ok: false,
        usedTransport: 'fs-access',
        message: ctx.t('bugReport.handoff.cursor.needPath'),
        fallbacks,
        ...(write.filePath !== undefined ? { filePath: write.filePath } : {}),
      };
    }

    // 6. Открываем файл отчёта в Cursor (оптимистично, под пользовательским жестом).
    ctx.transports.openDeepLink(link.value.url);
    return {
      ok: true,
      usedTransport: 'deep-link',
      message: ctx.t('bugReport.handoff.cursor.opened'),
      fallbacks,
      ...(write.filePath !== undefined ? { filePath: write.filePath } : {}),
    };
  },
};

// Адресат регистрируется при загрузке модуля (как фичи в `registry.ts`).
registerHandoffTarget(cursorTarget);

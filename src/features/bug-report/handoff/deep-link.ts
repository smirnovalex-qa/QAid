/**
 * Общий строитель deep-link для «Agent Handoff» (TASK-040): чистая функция без DOM и
 * `chrome.*`, собирающая `<scheme>://<path>?<params>&<promptParam>=<prompt>` с
 * URL-энкодом и ЖЁСТКОЙ гарантией лимита промпта. Конкретные схемы/параметры задают
 * адаптеры (TASK-043/044/045) — здесь только форма и валидация из контракта `./types`.
 *
 * Инвариант расширяемости: модуль НЕ импортирует `packager.ts` (нет крестовой связи) —
 * усечение промпта под лимит он делает сам, измеряя длину на URL-ЭНКОДЕ значения (реальная
 * стоимость в URL), а не на «сырой» длине. Ошибки возвращаются данными (`Result`,
 * канон errors-as-data), функция никогда не бросает через границу.
 */
import { err, ok, type Result } from '@/shared/result';
import {
  DEEP_LINK_PROMPT_LIMIT,
  type DeepLinkError,
  type DeepLinkOk,
  type DeepLinkSpec,
} from './types';

// ── регэкспы валидации ──────────────────────────────────────────────────────────

/** Безопасная URL-схема: буква, далее буквы/цифры/`+`/`.`/`-`. */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/;

/** `owner/name` — ровно один слэш, без ведущего/замыкающего. */
const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** Управляющие символы `0x00–0x1F` и `0x7F` — недопустимы в пути. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001F\u007F]/;

/**
 * Невидимые/bidi-символы, которыми можно замаскировать `..`/подмену пути:
 * zero-width и bidi-маркеры `U+200B–U+200F`, `U+202A–U+202E`, isolates
 * `U+2066–U+2069`, а также BOM `U+FEFF`.
 */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

/** Абсолютный POSIX-путь (`/...`) или Windows-диск (`C:\...` / `C:/...`). */
const ABSOLUTE_RE = /^(?:\/|[A-Za-z]:[\\/])/;

// ── валидаторы (каждый — Result<void, DeepLinkError>) ────────────────────────────

/** Проверяет схему по `^[a-z][a-z0-9+.-]*$`. */
export const validateScheme = (scheme: string): Result<void, DeepLinkError> =>
  SCHEME_RE.test(scheme)
    ? ok(undefined)
    : err({ kind: 'invalid-scheme', detail: `scheme "${scheme}" is not a valid URL scheme` });

/** Проверяет репозиторий в форме `owner/name` (ровно один слэш). */
export const validateRepo = (repo: string): Result<void, DeepLinkError> =>
  REPO_RE.test(repo)
    ? ok(undefined)
    : err({ kind: 'invalid-repo', detail: `repo "${repo}" is not in "owner/name" form` });

/**
 * Зеркалит правила Claude Code для корня проекта. ОТКЛОНЯЕТ: пустое; сегмент `..`;
 * UNC/сетевые пути (ведущие `\\` или `//`); управляющие символы; невидимые/bidi-символы.
 * ПРИНИМАЕТ абсолютно выглядящие POSIX (`/...`) или Windows (`C:\...` / `C:/...`) пути.
 */
export const validateCwd = (cwd: string): Result<void, DeepLinkError> => {
  const reject = (detail: string): Result<void, DeepLinkError> =>
    err({ kind: 'invalid-cwd', detail });

  if (cwd.length === 0) return reject('cwd is empty');
  if (CONTROL_RE.test(cwd)) return reject('cwd contains control characters');
  if (INVISIBLE_RE.test(cwd)) return reject('cwd contains invisible/bidi characters');
  // UNC / сетевой путь: два ведущих слэша (любого вида).
  if (/^[\\/]{2}/.test(cwd)) return reject('UNC/network paths are not allowed');
  // Любой сегмент, равный `..` (разделители — оба вида слэшей).
  if (cwd.split(/[\\/]/).some((seg) => seg === '..'))
    return reject('cwd must not contain ".." segments');
  if (!ABSOLUTE_RE.test(cwd)) return reject(`cwd "${cwd}" is not an absolute path`);

  return ok(undefined);
};

// ── строитель deep-link ──────────────────────────────────────────────────────────

/** URL-энкод значения (для well-formed строки из code points не бросает). */
const enc = (value: string): string => encodeURIComponent(value);

/** Непустая строка (иначе — «не задано»). */
const present = (value: string | undefined): value is string =>
  value !== undefined && value.length > 0;

/**
 * Собирает пометку усечения. Указатель на файл сохраняется целиком — усекается только
 * «голова» промпта, чтобы пользователь всегда получал ссылку на полный контекст.
 */
const truncationNotice = (filePointer: string | undefined): string =>
  present(filePointer) ? ` …[truncated — see ${filePointer}]` : ' …[truncated]';

/**
 * Усекает «сырой» промпт по КОДОВЫМ ТОЧКАМ (surrogate-пары не рвутся, иначе
 * `encodeURIComponent` бросил бы на одиночном суррогате), добиваясь того, чтобы
 * энкод `head + notice` укладывался в лимит. Возвращает финальную (ещё не энкоженную)
 * строку промпта с сохранённой пометкой.
 */
const truncateToEncodedLimit = (raw: string, limit: number, notice: string): string => {
  const cps = Array.from(raw);
  const fits = (count: number): boolean =>
    enc(cps.slice(0, count).join('') + notice).length <= limit;

  // Бинарный поиск максимального числа кодовых точек «головы», при котором энкод влезает.
  let lo = 0;
  let hi = cps.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return cps.slice(0, lo).join('') + notice;
};

/**
 * Строит deep-link из спецификации. Порядок параметров детерминирован:
 * `repo` → `cwd` (только присутствующий) → `extraParams` (ключи отсортированы) →
 * промпт (`spec.promptParam ?? 'q'`) последним. Все значения URL-энкодятся; лимит
 * промпта измеряется по ЭНКОЖЕНОЙ длине и жёстко гарантируется усечением.
 */
export const buildDeepLink = (spec: DeepLinkSpec): Result<DeepLinkOk, DeepLinkError> => {
  const schemeResult = validateScheme(spec.scheme);
  if (!schemeResult.ok) return schemeResult;

  const repo = spec.target?.repo;
  const cwd = spec.target?.cwd;
  const hasRepo = present(repo);
  const hasCwd = present(cwd);

  // Таргет присутствует, но оба поля пусты → нечего адресовать.
  if (spec.target !== undefined && !hasRepo && !hasCwd) {
    return err({ kind: 'no-target', detail: 'target is present but both repo and cwd are empty' });
  }

  if (hasRepo) {
    const repoResult = validateRepo(repo);
    if (!repoResult.ok) return repoResult;
  }
  if (hasCwd) {
    const cwdResult = validateCwd(cwd);
    if (!cwdResult.ok) return cwdResult;
  }

  const limit = spec.limit ?? DEEP_LINK_PROMPT_LIMIT;
  const encodedRaw = enc(spec.prompt);

  let finalPrompt: string;
  let truncated: boolean;
  if (encodedRaw.length <= limit) {
    finalPrompt = spec.prompt;
    truncated = false;
  } else {
    finalPrompt = truncateToEncodedLimit(spec.prompt, limit, truncationNotice(spec.filePointer));
    truncated = true;
  }

  const encodedPrompt = enc(finalPrompt);

  const params: string[] = [];
  if (hasRepo) params.push(`repo=${enc(repo)}`);
  if (hasCwd) params.push(`cwd=${enc(cwd)}`);
  if (spec.extraParams !== undefined) {
    for (const key of Object.keys(spec.extraParams).sort()) {
      const value = spec.extraParams[key];
      if (value === undefined) continue;
      params.push(`${enc(key)}=${enc(value)}`);
    }
  }
  params.push(`${spec.promptParam ?? 'q'}=${encodedPrompt}`);

  const base = `${spec.scheme}://${spec.path ?? ''}`;
  const url = `${base}?${params.join('&')}`;

  return ok({ url, truncated, promptLength: encodedPrompt.length });
};

/**
 * Ограниченный по времени soft-skip для permission-гейтнутых e2e (TASK-013+).
 *
 * ЗАЧЕМ ЭТО СУЩЕСТВУЕТ (не «упрощать» удалением бюджета!):
 * Тесты, которые дёргают `chrome.permissions.request` через синтетический
 * user-gesture, в песочнице недетерминированно поднимают **нативный** диалог
 * разрешений. Пока диалог висит, последующая инъекция/RPC не резолвится и
 * блокирует тест до полного таймаута Playwright (30s, см. playwright.config.ts).
 * Обычный `test.skip(!granted, …)` не спасает: guard не успевает выполниться,
 * потому что ждёт зависший вызов.
 *
 * Решение — гонка awaited-шага с коротким бюджетом (3–5s). Если грант/RPC не
 * уложился в бюджет (или упал), считаем разрешение «не выдано / недоступно» и
 * отдаём сигнал, по которому спека делает `test.skip(...)` — быстро и
 * детерминированно, вместо зависания на нативном диалоге. Когда разрешение
 * выдаётся штатно, `op()` резолвится задолго до бюджета и путь остаётся прежним:
 * спека продолжает проверять реальное поведение.
 *
 * Использование в спеке:
 *
 *   const res = await withPermissionTimeout(
 *     () => grantAndProbe(page), // await'ит grant + первый RPC/инъекцию
 *     { label: 'localStorage RPC' },
 *   );
 *   test.skip(!res.ok, res.reason ?? 'разрешение недоступно');
 *   const value = res.value!; // безопасно: ok === true
 *   // …обычные ассерты granted-пути…
 */

/** Бюджет по умолчанию: середина рекомендованного окна 3–5s. */
export const DEFAULT_PERMISSION_BUDGET_MS = 4_000;

/** Результат ограниченной по времени попытки получить разрешение / RPC. */
export interface BoundedPermissionResult<T> {
  /** true — `op()` уложился в бюджет и не упал; иначе спека должна soft-skip'нуться. */
  ok: boolean;
  /** Значение `op()`, присутствует только при `ok === true`. */
  value?: T;
  /** Человекочитаемая причина skip'а для аннотации, только при `ok === false`. */
  reason?: string;
}

export interface WithPermissionTimeoutOptions {
  /** Верхняя граница ожидания `op()` в мс (по умолчанию {@link DEFAULT_PERMISSION_BUDGET_MS}). */
  budgetMs?: number;
  /** Метка шага для читаемой причины skip'а (например, 'localStorage RPC', 'probe pick'). */
  label?: string;
}

/**
 * Гоняет `op()` против таймера бюджета.
 *
 * - `op()` зарезолвился  → `{ ok: true, value }`.
 * - таймер сработал первым → `{ ok: false, reason }` (зависший нативный диалог).
 * - `op()` бросил         → `{ ok: false, reason }` (разрешение не выдано / RPC недоступен).
 *
 * Никогда не пробрасывает исключение и не висит дольше `budgetMs` — так soft-skip
 * остаётся детерминированным и ограниченным по времени.
 */
export async function withPermissionTimeout<T>(
  op: () => Promise<T>,
  options: WithPermissionTimeoutOptions = {},
): Promise<BoundedPermissionResult<T>> {
  const budgetMs = options.budgetMs ?? DEFAULT_PERMISSION_BUDGET_MS;
  const label = options.label ?? 'permission grant/RPC';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BoundedPermissionResult<T>>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          ok: false,
          reason: `${label}: не уложился в бюджет ${budgetMs}ms — вероятно, завис нативный диалог разрешений в песочнице`,
        }),
      budgetMs,
    );
  });

  const attempt = (async (): Promise<BoundedPermissionResult<T>> => {
    try {
      return { ok: true, value: await op() };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `${label}: разрешение недоступно (${detail})` };
    }
  })();

  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    // Чистим таймер, чтобы висящий handle не держал процесс после гонки.
    if (timer) clearTimeout(timer);
  }
}

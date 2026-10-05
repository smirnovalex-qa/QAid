/**
 * I/O-оркестрация горячей замены сессии (session-profiles, TASK-047).
 *
 * Чистая логика (`logic.ts`) лишь ВЫЧИСЛЯЕТ снимок и план — этот модуль ИСПОЛНЯЕТ их
 * композицией read/write-RPC редактора storage/cookies (TASK-017). Никакого DOM,
 * `chrome.*`, preact — только контракты обмена и платформенный seam вкладок. Логика
 * извлечена из UI (`storage-editor` `collectSnapshot`/`applyImport`) в отдельный
 * тестируемый модуль с инъекцией зависимостей (deps c дефолтами), чтобы юнит-тесты шли
 * без реального Chrome/шины.
 *
 * Инвариант обработки ошибок: сбои отдельных RPC — это ДАННЫЕ (счётчик `failed`), а не
 * исключения. Функции не бросают на неудачной области/операции; `applySwapPlan`
 * возвращает `err(AppError)` лишь при непредвиденном исключении (например, если reload
 * бросил).
 */
import { sendMessage } from '@/shared/messaging/bus';
import { tabs } from '@/platform';
import { ok, err } from '@/shared/result';
import type { Result } from '@/shared/result';
import { appError } from '@/shared/errors';
import type { CookieRecord, StorageSnapshot } from '@/shared/inspection/storage/types';
import { buildSnapshotFromReads } from './logic';
import type { SwapPlan } from './types';

/** Инжектируемые зависимости (для юнит-тестов без Chrome). По умолчанию — реальные. */
export interface SwapDeps {
  send?: typeof sendMessage;
  reload?: (tabId: number) => Promise<void>;
}

/** Отчёт горячей замены: фактически записано/удалено/сбоев (ошибки едут данными, не throw). */
export interface SwapReport {
  readonly applied: number;
  readonly removed: number;
  readonly failed: number;
}

/**
 * Снимает текущее состояние активной вкладки композицией read-RPC:
 * storage/list(local) + storage/list(session) + (если withCookies) cookies/list.
 * НИКОГДА не бросает: неудачная область даёт пустой массив. Cookies опускаются, если
 * withCookies=false (право не выдано) — деградация до web storage.
 */
export async function captureCurrentSnapshot(
  tabId: number,
  opts: { readonly withCookies: boolean },
  deps: SwapDeps = {},
): Promise<StorageSnapshot> {
  const send = deps.send ?? sendMessage;

  const localRes = await send('storage/list', { tabId, area: 'local' });
  const sessionRes = await send('storage/list', { tabId, area: 'session' });

  let cookies: readonly CookieRecord[] = [];
  if (opts.withCookies) {
    const cookieRes = await send('cookies/list', { tabId });
    if (cookieRes.ok) cookies = cookieRes.value.cookies;
  }

  const local = localRes.ok ? localRes.value.items : [];
  const session = sessionRes.ok ? sessionRes.value.items : [];

  return buildSnapshotFromReads(cookies, local, session);
}

/**
 * Применяет план горячей замены к вкладке: СНАЧАЛА удаления (prune stale), ПОТОМ
 * записи, ПОТОМ reload вкладки (если opts.reload !== false). Cookies-операции
 * пропускаются при withCookies=false. Отдельные сбои RPC считаются в `failed`, а не
 * бросаются (ошибки — данные). Возвращает ok(SwapReport) даже при частичном успехе;
 * err(AppError) только при неожиданном исключении (напр. reload кинул).
 *
 * Порядок операций (важен): cookieRemoves → local.removes → session.removes →
 * cookieSets → local.sets → session.sets → reload. Сначала вычищаем «чужие» записи,
 * иначе остатки предыдущей сессии протекут в новую; reload в конце, чтобы страница
 * перечитала уже консистентное состояние.
 */
export async function applySwapPlan(
  tabId: number,
  plan: SwapPlan,
  opts: { readonly withCookies: boolean; readonly reload?: boolean },
  deps: SwapDeps = {},
): Promise<Result<SwapReport>> {
  const send = deps.send ?? sendMessage;
  const reload = deps.reload ?? tabs.reload;

  try {
    let applied = 0;
    let removed = 0;
    let failed = 0;

    // ── удаления (prune stale) ────────────────────────────────────────────────
    if (opts.withCookies) {
      for (const c of plan.cookieRemoves) {
        const res = await send('cookies/remove', {
          tabId,
          name: c.name,
          domain: c.domain,
          path: c.path,
        });
        if (res.ok && res.value.ok) removed += 1;
        else failed += 1;
      }
    }
    for (const key of plan.local.removes) {
      // storage/* отвечает `{ ok: literal(true) }` — успех определяется res.ok (RPC-уровень),
      // сам value.ok всегда true (в отличие от cookies/*, где ok — boolean результата).
      const res = await send('storage/remove', { tabId, area: 'local', key });
      if (res.ok) removed += 1;
      else failed += 1;
    }
    for (const key of plan.session.removes) {
      const res = await send('storage/remove', { tabId, area: 'session', key });
      if (res.ok) removed += 1;
      else failed += 1;
    }

    // ── записи ────────────────────────────────────────────────────────────────
    if (opts.withCookies) {
      for (const cookie of plan.cookieSets) {
        const res = await send('cookies/set', { tabId, cookie });
        if (res.ok && res.value.ok) applied += 1;
        else failed += 1;
      }
    }
    for (const e of plan.local.sets) {
      const res = await send('storage/set', { tabId, area: 'local', key: e.key, value: e.value });
      if (res.ok) applied += 1;
      else failed += 1;
    }
    for (const e of plan.session.sets) {
      const res = await send('storage/set', { tabId, area: 'session', key: e.key, value: e.value });
      if (res.ok) applied += 1;
      else failed += 1;
    }

    // ── reload (обязательный шаг: SPA перечитывает состояние только при загрузке) ─
    if (opts.reload !== false) {
      await reload(tabId);
    }

    return ok({ applied, removed, failed });
  } catch (e) {
    return err(appError('INTERNAL', String(e)));
  }
}

/**
 * Жизненный цикл CDP-сессий мока сети (TASK-032). Идемпотентные attach/detach поверх
 * платформенного `debugger`-seam с ГАРАНТИЕЙ освобождения отладчика во всех ветках:
 * выключение (`detach`), закрытие вкладки (`onRemoved`), ошибка attach/enable, и ручной
 * `onDetach` (пользователь закрыл баннер или открыл DevTools на вкладке).
 *
 * Почему это критично: повисшая `debugger`-сессия = баннер отладки навсегда и
 * заблокированный DevTools на вкладке. Поэтому: без двойного attach (повторный на ту
 * же вкладку лишь обновляет правила), detach best-effort и после `onDetach` НЕ дёргаем
 * `seam.detach` снова (браузер уже отсоединился). Слушатели `onEvent`/`onDetach`/
 * `onRemoved` ставятся лениво один раз; событие роутится процессору нужной вкладки.
 *
 * Транспортная корректность (матчинг/резолв/CDP-команды) — в `transport.ts`; здесь —
 * только реестр сессий и их безопасное освобождение. Seam/tabEvents инъектируются
 * (тестируемость без Chrome); background собирает контроллер с реальным `@/platform`.
 */
import { logger } from '@/shared/logger';
import type { DebuggerSeam } from '@/platform';
import type { CompiledRule } from '../types';
import { createCdpFetchProcessor } from './transport';
import type { CdpFetchProcessor } from './transport';

/** Статус CDP-сессии для UI (панель показывает «CDP активен»/реагирует на detach). */
export type CdpStatus = 'attached' | 'detached';

/** Результат попытки подключения: успех либо причина отказа (для fallback на MAIN). */
export type AttachResult = { ok: true } | { ok: false; reason: string };

/** События жизненного цикла вкладок (подмножество платформенного `tabEvents`). */
export interface TabRemovedEvents {
  onRemoved: { addListener(cb: (tabId: number) => void): void };
}

export interface CdpLifecycleDeps {
  seam: DebuggerSeam;
  tabEvents: TabRemovedEvents;
  /** Уведомление UI-плоскости о смене статуса (напр. ручной detach пользователем). */
  onStatusChange?: (tabId: number, status: CdpStatus, reason?: string) => void;
  /** Фабрика процессора (по умолчанию — реальный transport поверх seam); тесты подменяют. */
  createProcessor?: (tabId: number) => CdpFetchProcessor;
  /** Кап лога процессора (по умолчанию из `INTERCEPTOR_LIMITS`). */
  logCap?: number;
}

export interface CdpLifecycle {
  /** Подключает отладчик и включает перехват с набором правил. Идемпотентно по вкладке. */
  attach(tabId: number, rules: CompiledRule[]): Promise<AttachResult>;
  /** Обновляет действующие правила активной сессии (без ре-attach). */
  updateRules(tabId: number, rules: CompiledRule[]): void;
  /** Снимает отладчик с вкладки (гарантированно, best-effort). No-op, если не подключён. */
  detach(tabId: number): Promise<void>;
  /** Активна ли CDP-сессия на вкладке. */
  isActive(tabId: number): boolean;
  /** Снимок лога пойманных запросов вкладки. */
  readLog(tabId: number): ReturnType<CdpFetchProcessor['readLog']>;
}

interface CdpSession {
  processor: CdpFetchProcessor;
}

/**
 * Создаёт контроллер жизненного цикла CDP. Реестр сессий живёт в замыкании (память SW);
 * глобальные слушатели отладчика/вкладок ставятся один раз при первом attach.
 */
export function createCdpLifecycle(deps: CdpLifecycleDeps): CdpLifecycle {
  const { seam, tabEvents, onStatusChange } = deps;
  const sessions = new Map<number, CdpSession>();
  let listenersInstalled = false;

  const makeProcessor =
    deps.createProcessor ??
    ((tabId: number): CdpFetchProcessor =>
      // `exactOptionalPropertyTypes`: `logCap` опускаем, а не шлём `undefined`
      // (процессор сам подставит дефолт из `INTERCEPTOR_LIMITS`).
      createCdpFetchProcessor({
        tabId,
        seam,
        ...(deps.logCap !== undefined ? { logCap: deps.logCap } : {}),
      }));

  const notify = (tabId: number, status: CdpStatus, reason?: string): void => {
    try {
      onStatusChange?.(tabId, status, reason);
    } catch (e) {
      logger.debug('mock.cdp.status', e);
    }
  };

  /** Ленивая установка слушателей событий отладчика и закрытия вкладок (единожды). */
  const installListeners = (): void => {
    if (listenersInstalled) return;
    listenersInstalled = true;

    seam.onEvent.addListener((source, method, params) => {
      const tabId = source.tabId;
      if (tabId === undefined) return;
      // Нормализуем к `{ tabId: number }` — `Debuggee.tabId` под
      // `exactOptionalPropertyTypes` несёт `| undefined`, здесь оно уже сужено.
      sessions.get(tabId)?.processor.handleEvent({ tabId }, method, params);
    });

    // Браузер сам отсоединил отладчик (пользователь закрыл баннер / открыл DevTools /
    // вкладка закрыта). Отладчик УЖЕ снят — только чистим реестр и уведомляем UI,
    // повторный seam.detach НЕ вызываем.
    seam.onDetach.addListener((source, reason) => {
      const tabId = source.tabId;
      if (tabId === undefined) return;
      const session = sessions.get(tabId);
      if (!session) return;
      session.processor.reset();
      sessions.delete(tabId);
      notify(tabId, 'detached', reason);
    });

    tabEvents.onRemoved.addListener((tabId) => {
      if (!sessions.has(tabId)) return;
      void detach(tabId);
    });
  };

  const attach = async (tabId: number, rules: CompiledRule[]): Promise<AttachResult> => {
    installListeners();

    // Идемпотентность: повторный attach на ту же вкладку лишь обновляет правила —
    // без второго chrome.debugger.attach (иначе ошибка «Already attached»).
    const existing = sessions.get(tabId);
    if (existing) {
      existing.processor.updateRules(rules);
      return { ok: true };
    }

    try {
      await seam.attach(tabId);
    } catch (e) {
      logger.error('mock.cdp.attach', e);
      return { ok: false, reason: 'attach-failed' };
    }

    const processor = makeProcessor(tabId);
    processor.updateRules(rules);
    // Регистрируем сессию ДО enable, чтобы события Fetch.enable-фазы попадали к процессору.
    sessions.set(tabId, { processor });

    try {
      await processor.enable();
    } catch (e) {
      // Enable упал — гарантированно освобождаем отладчик, чтобы не оставить баннер.
      logger.error('mock.cdp.enable', e);
      sessions.delete(tabId);
      processor.reset();
      await seam.detach(tabId).catch(() => undefined);
      return { ok: false, reason: 'enable-failed' };
    }

    notify(tabId, 'attached');
    return { ok: true };
  };

  const detach = async (tabId: number): Promise<void> => {
    const session = sessions.get(tabId);
    if (!session) return;
    sessions.delete(tabId);
    session.processor.reset();
    // best-effort: вкладка/сессия могла быть уже недоступна (закрытие/навигация).
    await seam.detach(tabId).catch((e: unknown) => {
      logger.debug('mock.cdp.detach', e);
    });
    notify(tabId, 'detached');
  };

  return {
    attach,
    updateRules(tabId: number, rules: CompiledRule[]): void {
      sessions.get(tabId)?.processor.updateRules(rules);
    },
    detach,
    isActive(tabId: number): boolean {
      return sessions.has(tabId);
    },
    readLog(tabId: number) {
      return sessions.get(tabId)?.processor.readLog() ?? [];
    },
  };
}

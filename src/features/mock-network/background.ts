/**
 * Фоновый оркестратор мока сети (TASK-022). Реализует доменные хендлеры
 * `mock/apply` / `mock/clear` / `mock/observe` / `mock/observeStop` / `mock/poll` поверх
 * платформенного seam (MAIN-world инъекция перехватчика). Прямой `chrome.*` вне
 * платформы запрещён (ADR-0014) — всё через `@/platform`.
 *
 * Жизненным циклом MAIN-перехватчика владеет РАЗДЕЛЯЕМАЯ ref-count сессия
 * (`createNetworkCaptureSession`, shared): перехватчик живёт, пока есть хотя бы один
 * потребитель, правила — объединение их вкладов, ре-инъекция при навигации и teardown —
 * внутри сессии. Это снимает конфликты, когда за наблюдением за сетью приходит другая
 * фича (напр. «Экспорт бага» через `mock/observe`): её лог и правила мока сосуществуют,
 * никто не затирает и не убивает чужую сессию.
 *
 * Стратегия перехвата (ADR гибридной стратегии, PRD §9): два транспорта поверх ОДНОГО
 * движка правил (`logic.ts`). `main` — MAIN-инъекция обёрток fetch/XHR (дефолт); `cdp`
 * (TASK-032, ADR-0038) — перехват через `chrome.debugger` + CDP `Fetch` domain,
 * ловит запросы в обход обёрток (воркеры/`sendBeacon`/ресурсы) ценой баннера отладки.
 * CDP-транспорт живёт за контроллером `createCdpLifecycle` (идемпотентный attach/detach
 * с гарантией освобождения отладчика); background лишь роутит apply/clear/poll в него.
 */
import './messages';
import type { BackgroundHandler } from '@/features/registry';
import type { RequestOf } from '@/shared/messaging/contract';
import { debuggerSeam, scriptingMain, tabEvents } from '@/platform';
import { logger } from '@/shared/logger';
import { createNetworkCaptureSession } from '@/shared/inspection/network/capture-session';
import { compileRules } from './logic';
import { INTERCEPTOR_LIMITS } from './types';
import type { CaughtRequest, CompiledRule, MockRule, ReplayResult } from './types';
import { clearMockInterceptor, installMockInterceptor, readMockLog } from './interceptor';
import { createSender } from './replay/sender';
import { createCdpLifecycle } from './cdp/lifecycle';
import type { CdpLifecycle } from './cdp/lifecycle';

/** Токены потребителей MAIN-сессии перехвата (ref-count в `captureSession`). */
const CONSUMER_MOCK = 'mock'; // «Мок сети» — свои правила подмены
const CONSUMER_OBSERVER = 'observer'; // «Экспорт бага» и пр. — только лог (пустые правила)

/**
 * Единый владелец MAIN-перехватчика на вкладку (ref-count по потребителям). Логирование
 * живёт, пока есть хотя бы один потребитель; правила — объединение их вкладов. Прочие
 * фичи ходят сюда через контракты `mock/observe` / `mock/observeStop` (fitness §12.1),
 * не касаясь `installMockInterceptor` напрямую. CDP-транспорт — отдельный путь ниже.
 */
const captureSession = createNetworkCaptureSession<CompiledRule, CaughtRequest>({
  install: (tabId, rules, immediate) => inject(tabId, rules, immediate),
  clear: (tabId) => scriptingMain.run(tabId, clearMockInterceptor, []).then(() => undefined),
  read: async (tabId) => {
    const res = await scriptingMain.run(tabId, readMockLog, []);
    return (res as { result?: CaughtRequest[] }[] | undefined)?.[0]?.result ?? [];
  },
  tabEvents,
  onError: (scope, error) => {
    logger.debug(`mock.capture.${scope}`, error);
  },
});

/** Вкладки с выбранным CDP-транспортом — чтобы `poll` читал CDP-лог, а не MAIN. */
const cdpTabs = new Set<number>();

/** Ленивый контроллер CDP-транспорта (реестр сессий живёт в его замыкании). */
let cdpLifecycle: CdpLifecycle | undefined;
function getCdp(): CdpLifecycle {
  cdpLifecycle ??= createCdpLifecycle({
    seam: debuggerSeam,
    tabEvents,
    logCap: INTERCEPTOR_LIMITS.logCap,
  });
  return cdpLifecycle;
}

/** Инъектирует перехватчик с набором скомпилированных правил в MAIN-world вкладки. */
async function inject(tabId: number, rules: CompiledRule[], immediate: boolean): Promise<void> {
  await scriptingMain.run(
    tabId,
    installMockInterceptor,
    [{ rules, logCap: INTERCEPTOR_LIMITS.logCap, bodyCap: INTERCEPTOR_LIMITS.bodyCap }],
    immediate,
  );
}

async function apply(req: RequestOf<'mock/apply'>): Promise<{ ok: boolean; reason?: string }> {
  const { tabId } = req;
  // Роутер отдаёт УЖЕ распарсенные правила (zod-дефолты TASK-023 применены); приводим
  // к `MockRule[]` — соответствует рантайму (входной тип `RequestOf` шире).
  const rules = compileRules(req.rules as MockRule[]);

  if (req.strategy === 'cdp') {
    // CDP-транспорт (TASK-032): подключение отладчика под жестом (право `debugger` —
    // install-time, см. ADR-0038). Идемпотентно: повторный apply лишь обновит правила.
    const res = await getCdp().attach(tabId, rules);
    if (!res.ok) {
      cdpTabs.delete(tabId);
      return { ok: false, reason: res.reason };
    }
    cdpTabs.add(tabId);
    return { ok: true };
  }
  // MAIN-транспорт: регистрируем «мок» как потребителя со своими правилами. Ре-инъекция
  // при навигации, объединение с наблюдателем и teardown — на стороне сессии.
  const res = await captureSession.acquire(CONSUMER_MOCK, tabId, rules);
  return res.ok ? { ok: true } : { ok: false, reason: 'inject-failed' };
}

async function clear(req: RequestOf<'mock/clear'>): Promise<{ ok: true }> {
  const { tabId } = req;
  // CDP-транспорт: гарантированно снимаем отладчик (детач best-effort в контроллере).
  if (cdpTabs.has(tabId)) {
    cdpTabs.delete(tabId);
    await getCdp().detach(tabId);
    return { ok: true };
  }
  // MAIN: снимаем ТОЛЬКО потребителя «мок». Если ещё есть наблюдатель — перехватчик и лог
  // остаются (мокинг прекращается: правила схлопываются к пустым), иначе сессия снимается.
  await captureSession.release(CONSUMER_MOCK, tabId);
  return { ok: true };
}

/**
 * `mock/observe` — регистрирует потребителя «только лог» (пустые правила): наблюдение
 * за fetch/XHR без мокинга (TASK-025). Ref-count в сессии; не затирает правила мока.
 */
async function observe(req: RequestOf<'mock/observe'>): Promise<{ ok: true }> {
  const { tabId } = req;
  await captureSession.acquire(CONSUMER_OBSERVER, tabId, []);
  return { ok: true };
}

/** `mock/observeStop` — снимает потребителя-наблюдателя (перехватчик жив, пока нужен моку). */
async function observeStop(req: RequestOf<'mock/observeStop'>): Promise<{ ok: true }> {
  const { tabId } = req;
  await captureSession.release(CONSUMER_OBSERVER, tabId);
  return { ok: true };
}

async function poll(
  req: RequestOf<'mock/poll'>,
): Promise<{ entries: CaughtRequest[]; active: boolean }> {
  const { tabId } = req;
  // CDP-транспорт: читаем лог из контроллера. `active:false` при ручном detach
  // пользователя (закрыл баннер/открыл DevTools) — панель честно остановит перехват.
  if (cdpTabs.has(tabId)) {
    const cdp = getCdp();
    const stillActive = cdp.isActive(tabId);
    if (!stillActive) cdpTabs.delete(tabId);
    return { entries: cdp.readLog(tabId), active: stillActive };
  }
  try {
    return { entries: await captureSession.read(tabId), active: true };
  } catch (e) {
    logger.debug('mock.poll', e);
    return { entries: [], active: true };
  }
}

/**
 * `mock/status` — активен ли перехват на вкладке ПРЯМО СЕЙЧАС (источник истины для
 * переоткрытой панели). Отражает только то, чем фон реально владеет: ref-count MAIN-
 * сессии либо реестр CDP. Это сознательно не «жив ли ещё перехватчик в странице» —
 * после перезапуска SW осиротевший MAIN-перехватчик не переживёт ближайшую навигацию
 * (фон его не переинъектирует) и его нельзя чисто снять через ref-count, поэтому честный
 * ответ фона — `inactive`. При закрытии/переоткрытии панели (SW жив) сессия сохраняется,
 * и статус честно вернёт `active` — именно этот случай и чиним.
 */
function status(
  req: RequestOf<'mock/status'>,
): Promise<{ active: boolean; strategy: 'main' | 'cdp' }> {
  const { tabId } = req;
  if (cdpTabs.has(tabId)) {
    const active = getCdp().isActive(tabId);
    if (!active) cdpTabs.delete(tabId);
    return Promise.resolve({ active, strategy: 'cdp' });
  }
  return Promise.resolve({ active: captureSession.isActive(tabId), strategy: 'main' });
}

/**
 * Sender replay (TASK-038) — единый на SW. Дефолтный `fetch` из контекста
 * расширения (host-право, обход CORS страницы). Никогда не бросает: возвращает
 * дискриминируемый `ReplayResult`.
 */
const sender = createSender();

async function replay(req: RequestOf<'mock/replay'>): Promise<ReplayResult> {
  return sender.send(req);
}

/**
 * Доменные хендлеры мока. Подключаются в SW из background-барели
 * (`@/features/background` → `registerBackground`, ADR-0047); вход уже провалидирован
 * zod в роутере.
 */
export const mockNetworkBackgroundHandlers: BackgroundHandler[] = [
  { type: 'mock/apply', handler: (req) => apply(req as RequestOf<'mock/apply'>) },
  { type: 'mock/clear', handler: (req) => clear(req as RequestOf<'mock/clear'>) },
  { type: 'mock/observe', handler: (req) => observe(req as RequestOf<'mock/observe'>) },
  { type: 'mock/observeStop', handler: (req) => observeStop(req as RequestOf<'mock/observeStop'>) },
  { type: 'mock/poll', handler: (req) => poll(req as RequestOf<'mock/poll'>) },
  { type: 'mock/status', handler: (req) => status(req as RequestOf<'mock/status'>) },
  { type: 'mock/replay', handler: (req) => replay(req as RequestOf<'mock/replay'>) },
];

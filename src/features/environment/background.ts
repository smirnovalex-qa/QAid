/**
 * Фоновый оркестратор эмуляции окружения (TASK-019). Реализует доменные хендлеры
 * `environment/apply` / `environment/clear` поверх платформенного seam (DNR
 * session-rules + MAIN-world инъекция). Прямой `chrome.*` вне платформы запрещён
 * (ADR-0014) — всё идёт через `@/platform`.
 *
 * Две плоскости подмены с разным жизненным циклом:
 *  - **Заголовки** (`User-Agent`/`Accept-Language`) — DNR session-rules,
 *    ограниченные `tabId`. Переживают навигацию вкладки сами (браузер применяет их
 *    к каждому запросу), снимаются при выключении/закрытии вкладки.
 *  - **Страничные оверрайды** (`navigator`/`Intl`/`geolocation`) — инъекция в
 *    MAIN-world. НЕ переживают загрузку документа, поэтому фон следит за навигацией
 *    активных вкладок (`tabEvents.onUpdated`) и инъектирует их заново.
 *
 * Реестр активных эмуляций (`active`) живёт в памяти SW: session-rules и без него
 * эфемерны, а ре-инъекция требует знать конфиг вкладки. Слушатели ставятся лениво
 * при первом apply (ядро не вызывает init фич — только регистрирует хендлеры).
 */
import './messages';
import type { BackgroundHandler } from '@/features/registry';
import type { RequestOf } from '@/shared/messaging/contract';
import type { DnrUpdateOptions } from '@/platform';
import { declarativeNetRequest, scriptingMain, tabEvents } from '@/platform';
import { logger } from '@/shared/logger';
import { buildHeaderRules, hasPageOverrides, headerRuleId } from './logic';
import { applyEnvironmentOverrides, clearEnvironmentOverrides } from './overrides';
import type { EnvironmentConfig } from './types';

/** Активные эмуляции по вкладке — для ре-инъекции при навигации и очистки при закрытии. */
const active = new Map<number, EnvironmentConfig>();

let lifecycleInstalled = false;

/** Ставит/переписывает DNR session-rule подмены заголовков для вкладки (или снимает). */
async function setHeaderRules(config: EnvironmentConfig, tabId: number): Promise<void> {
  const rules = buildHeaderRules(config, tabId);
  // Всегда сперва убираем прежнее правило вкладки (идемпотентность), затем — новое
  // (если подменять нечего, addRules пуст, остаётся снятие).
  const options = {
    removeRuleIds: [headerRuleId(tabId)],
    addRules: rules,
  } as unknown as DnrUpdateOptions;
  await declarativeNetRequest.updateSessionRules(options);
}

/** Снимает DNR-правило подмены заголовков вкладки. */
async function removeHeaderRules(tabId: number): Promise<void> {
  await declarativeNetRequest.updateSessionRules({ removeRuleIds: [headerRuleId(tabId)] });
}

/** Инъектирует MAIN-world оверрайды (если конфиг что-то подменяет на странице). */
async function injectOverrides(
  config: EnvironmentConfig,
  tabId: number,
  immediate: boolean,
): Promise<void> {
  if (!hasPageOverrides(config)) return;
  await scriptingMain.run(tabId, applyEnvironmentOverrides, [config], immediate);
}

/** Ленивая установка слушателей навигации/закрытия вкладок (единожды). */
function installLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  tabEvents.onUpdated.addListener((tabId, changeInfo) => {
    const config = active.get(tabId);
    if (config === undefined || changeInfo.status !== 'loading') return;
    // Навигация сбросила MAIN-world оверрайды — инъектируем заново как можно раньше.
    void injectOverrides(config, tabId, true).catch((e: unknown) => {
      logger.debug('environment.reinject', e);
    });
  });

  tabEvents.onRemoved.addListener((tabId) => {
    if (!active.has(tabId)) return;
    active.delete(tabId);
    void removeHeaderRules(tabId).catch((e: unknown) => {
      logger.debug('environment.cleanup', e);
    });
  });
}

async function apply(req: RequestOf<'environment/apply'>): Promise<{ ok: boolean }> {
  installLifecycle();
  const { tabId, config } = req;
  try {
    await setHeaderRules(config, tabId);
    await injectOverrides(config, tabId, false);
    active.set(tabId, config);
    return { ok: true };
  } catch (error) {
    logger.error('environment.apply', error);
    // Частично применённое состояние откатываем best-effort, чтобы не оставить
    // «половину» эмуляции (только заголовки без страничных оверрайдов и наоборот).
    active.delete(tabId);
    await removeHeaderRules(tabId).catch(() => undefined);
    return { ok: false };
  }
}

async function clear(req: RequestOf<'environment/clear'>): Promise<{ ok: true }> {
  const { tabId } = req;
  active.delete(tabId);
  await removeHeaderRules(tabId).catch((e: unknown) => {
    logger.debug('environment.clear.headers', e);
  });
  // Снятие страничных оверрайдов — best-effort: вкладка могла быть уже закрыта или
  // недоступна; заголовки в любом случае сняты выше.
  await scriptingMain.run(tabId, clearEnvironmentOverrides, []).catch((e: unknown) => {
    logger.debug('environment.clear.inject', e);
  });
  return { ok: true };
}

/**
 * Доменные хендлеры эмуляции. Подключаются в SW из background-барели
 * (`@/features/background` → `registerBackground`, ADR-0047); вход уже провалидирован
 * zod в роутере.
 */
export const environmentBackgroundHandlers: BackgroundHandler[] = [
  { type: 'environment/apply', handler: (req) => apply(req as RequestOf<'environment/apply'>) },
  { type: 'environment/clear', handler: (req) => clear(req as RequestOf<'environment/clear'>) },
];

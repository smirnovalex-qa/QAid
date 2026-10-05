/**
 * Брокер optional-permissions (ADR-0013, least-privilege в рантайме).
 *
 * Контракт `PermissionBroker` объявлен ядром (TASK-003); реализация
 * `createPermissionBroker` появляется здесь вместе с первой фичей, которой нужны
 * optional-права (инспектор, TASK-013). Абстракция обобщена: брокер не хардкодит
 * набор прав — его переиспользуют TASK-017 (`cookies`) и TASK-019 (host-права
 * эмуляции), передавая свой `PermissionRequest`.
 *
 * **Пользовательский жест.** `ensure` вызывает `chrome.permissions.request`,
 * который браузер выполняет только под жестом пользователя (клик в popup/side
 * panel). Вызов из background без жеста будет отклонён — там доступна лишь
 * `has()` (обёртка над `contains`); UI должен инициировать `ensure` по клику.
 */
import type { PermissionSpec } from '@/platform';
import { permissions as platformPermissions } from '@/platform';
import { logger } from '@/shared/logger';

/** Права, декларируемые фичей в дескрипторе (`FeatureModule.permissions`). */
export interface PermissionRequest {
  optional?: string[];
  host?: string[];
}

export interface PermissionBroker {
  /** Запрашивает права (пользовательский жест) при первом использовании фичи. */
  ensure(request: PermissionRequest): Promise<boolean>;
  /** Проверяет, выданы ли уже права, без запроса. */
  has(request: PermissionRequest): Promise<boolean>;
}

/** Событие изменения набора прав (форма `chrome.permissions.onAdded/onRemoved`). */
interface PermissionsEvent {
  addListener(cb: () => void): void;
  removeListener(cb: () => void): void;
}

/**
 * Платформенный seam (ADR-0014): абстрагирует `chrome.permissions`, чтобы брокер
 * юнит-тестировался без Chrome (по аналогии со `storage-area`, ADR-0014).
 */
export interface BrowserPermissions {
  request(spec: PermissionSpec): Promise<boolean>;
  contains(spec: PermissionSpec): Promise<boolean>;
  onAdded: PermissionsEvent;
  onRemoved: PermissionsEvent;
}

/** Дефолтный seam поверх платформенного адаптера. */
function defaultBrowserPermissions(): BrowserPermissions {
  return {
    request: platformPermissions.request,
    contains: platformPermissions.contains,
    onAdded: platformPermissions.onAdded,
    onRemoved: platformPermissions.onRemoved,
  };
}

/** Нормализует `PermissionRequest` в аргумент платформенного API. */
function toSpec(request: PermissionRequest): PermissionSpec {
  const spec: { permissions?: string[]; origins?: string[] } = {};
  if (request.optional && request.optional.length > 0) spec.permissions = request.optional;
  if (request.host && request.host.length > 0) spec.origins = request.host;
  return spec as PermissionSpec;
}

/** Стабильный ключ кэша по содержимому запроса (порядок прав не важен). */
function cacheKey(request: PermissionRequest): string {
  const optional = [...(request.optional ?? [])].sort();
  const host = [...(request.host ?? [])].sort();
  return JSON.stringify({ optional, host });
}

export function createPermissionBroker(deps?: {
  permissions?: BrowserPermissions;
}): PermissionBroker {
  const api = deps?.permissions ?? defaultBrowserPermissions();
  /** Кэш результатов `has()`; инвалидируется на любое изменение набора прав. */
  const cache = new Map<string, boolean>();

  const invalidate = (): void => {
    cache.clear();
  };
  api.onAdded.addListener(invalidate);
  api.onRemoved.addListener(invalidate);

  const has = async (request: PermissionRequest): Promise<boolean> => {
    const key = cacheKey(request);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    try {
      const granted = await api.contains(toSpec(request));
      cache.set(key, granted);
      return granted;
    } catch (error) {
      logger.error('permissions.has', error);
      return false;
    }
  };

  const ensure = async (request: PermissionRequest): Promise<boolean> => {
    const key = cacheKey(request);
    // Быстрый путь: право уже подтверждено ранее (напр. предыдущим сбором под жестом).
    // НЕ вызываем `request()` повторно — он требует активного пользовательского жеста и
    // в ряде контекстов (side panel) отклоняется «must be called during a user gesture»
    // даже для УЖЕ выданных прав. Кэш читается синхронно, поэтому жест для настоящего
    // первого запроса ниже НЕ теряется (никаких await перед `request()`).
    if (cache.get(key) === true) return true;
    try {
      // Первый await в ветке — сам `request()`: пользовательский жест ещё жив.
      const granted = await api.request(toSpec(request));
      cache.set(key, granted);
      return granted;
    } catch (error) {
      // `request()` кинул (обычно — нет активного жеста на повторном действии, когда право
      // фактически уже есть, в т.ч. персист между сессиями с холодным кэшем). `contains()`
      // жеста не требует — деградируем к нему, прежде чем сдаться: право могло быть выдано
      // как часть более широкого набора (напр. cookies+scripting) или в прошлой сессии.
      try {
        const held = await api.contains(toSpec(request));
        cache.set(key, held);
        if (held) return true;
      } catch (containsError) {
        logger.debug('permissions.ensure.contains', containsError);
      }
      // Отказ/исключение платформы не пробрасывается наружу — фича деградирует.
      logger.error('permissions.ensure', error);
      return false;
    }
  };

  return { ensure, has };
}

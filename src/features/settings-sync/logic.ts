/**
 * Чистая логика синка (TASK-029) — БЕЗ chrome/@platform/preact.
 *
 * Центральный инвариант фичи: LWW-слияние по `updatedAt`, детект конфликта (обе
 * стороны менялись с момента base), оценка размера полезной нагрузки против квот
 * `chrome.storage.sync`, версионирование конверта + миграции. Все функции детер-
 * министичны и сериализуемо-совместимы (никаких `Date.now`/IO — время инжектится
 * движком). Покрытие целится в ~100% векторными тестами.
 */
import { ENVELOPE_VERSION } from './types';
import type {
  EnvelopeMigration,
  MergeResult,
  QuotaCheck,
  QuotaLimits,
  SyncEnvelope,
} from './types';

/** Ключ элемента `chrome.storage.sync` для namespace'а. */
export function syncKey(namespaceId: string): string {
  return `qatb.sync.${namespaceId}`;
}

/** Префикс всех ключей синка (для фильтрации `onChanged`). */
export const SYNC_KEY_PREFIX = 'qatb.sync.';

/** Извлекает id namespace'а из ключа синка (или `null`, если ключ не наш). */
export function namespaceIdFromKey(key: string): string | null {
  return key.startsWith(SYNC_KEY_PREFIX) ? key.slice(SYNC_KEY_PREFIX.length) : null;
}

// ── стабильная сериализация (порядко-независимые подписи значений) ─────────────

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortValue(src[k]);
    return out;
  }
  return value;
}

/** Детерминированная строка значения: ключи объектов сортируются рекурсивно. */
export function stableStringify(value: unknown): string {
  // JSON.stringify возвращает undefined для undefined/функций/символов, но типы
  // объявляют возврат `string`. Приводим сигнатуру к честной (`| undefined`), чтобы
  // подстановка '' (устойчивая пустая подпись) не считалась «лишней» проверкой.
  const stringify = JSON.stringify as (v: unknown) => string | undefined;
  return stringify(sortValue(value)) ?? '';
}

/** Структурное равенство через стабильную сериализацию. */
export function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

// ── конверт: конструирование, распознавание, миграции ──────────────────────────

/** Собирает конверт синка. */
export function makeEnvelope<T>(
  value: T,
  updatedAt: number,
  v: number = ENVELOPE_VERSION,
): SyncEnvelope<T> {
  return { v, updatedAt, value };
}

/** Проверяет, что сырое значение — валидный конверт синка. */
export function isEnvelope(raw: unknown): raw is SyncEnvelope {
  if (raw === null || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return typeof o.v === 'number' && typeof o.updatedAt === 'number' && 'value' in o;
}

/**
 * Приводит сырой удалённый блоб к конверту текущей версии: прогоняет миграции
 * вверх по цепочке `from → from+1`, затем валидирует форму. `null` — если блоб не
 * конверт или его не удалось привести к текущей версии (устойчивость к чужому/
 * старому/битому значению в `sync`).
 */
export function parseEnvelope(
  raw: unknown,
  migrations: readonly EnvelopeMigration[] = [],
  current: number = ENVELOPE_VERSION,
): SyncEnvelope | null {
  if (raw === null || typeof raw !== 'object') return null;
  let candidate = raw as Record<string, unknown>;
  let guard = 0;
  while (typeof candidate.v === 'number' && candidate.v < current) {
    const from = candidate.v;
    const migration = migrations.find((m) => m.from === from);
    if (migration === undefined) break; // нет пути миграции — ниже провалит валидацию версии
    candidate = migration.migrate(candidate);
    guard += 1;
    if (guard > 100) break; // защита от кривой цепочки миграций
  }
  if (!isEnvelope(candidate)) return null;
  return candidate.v === current ? candidate : null;
}

// ── LWW-слияние + детект конфликта ─────────────────────────────────────────────

/**
 * Сливает локальный и удалённый конверты по правилу «последняя запись побеждает»
 * (`updatedAt`). `base` — updatedAt последнего согласованного конверта (0 = ни
 * разу не синкали). Конфликт — когда ОБЕ стороны менялись с момента base; тогда
 * победитель всё равно выбирается по LWW, но взводится маркер конфликта.
 *
 * Локальный слой — источник истины: если удалённого нет, но локальное есть, —
 * пушим локальное (даже если раньше синкали и элемент удалён на другом устройстве).
 */
export function mergeLww<T = unknown>(
  local: SyncEnvelope<T> | undefined,
  remote: SyncEnvelope<T> | undefined,
  base: number,
): MergeResult<T> {
  const hasBase = base > 0;

  if (local === undefined) {
    return remote === undefined
      ? { kind: 'none', conflict: false }
      : { kind: 'remote', side: 'remote', winner: remote, conflict: false };
  }
  if (remote === undefined) {
    return { kind: 'local', side: 'local', winner: local, conflict: false };
  }

  const l = local;
  const r = remote;
  if (l.updatedAt === r.updatedAt) {
    return { kind: 'equal', side: 'local', winner: l, conflict: false };
  }

  const localChanged = !hasBase || l.updatedAt > base;
  const remoteChanged = !hasBase || r.updatedAt !== base;
  const side: 'local' | 'remote' = r.updatedAt > l.updatedAt ? 'remote' : 'local';
  const winner = side === 'remote' ? r : l;
  const conflict = localChanged && remoteChanged;
  return { kind: conflict ? 'conflict' : side, side, winner, conflict };
}

/**
 * Изменилось ли локальное значение с момента последнего согласования. Никогда не
 * синкали (`baseUpdatedAt === 0`) — считаем изменённым, если значение вообще есть.
 */
export function localChangedSince(
  currentValue: unknown,
  baseSig: string,
  baseUpdatedAt: number,
): boolean {
  if (baseUpdatedAt === 0) return currentValue !== undefined;
  return stableStringify(currentValue) !== baseSig;
}

// ── квоты ───────────────────────────────────────────────────────────────────────

/**
 * Оценка размера элемента `chrome.storage.sync`: длина ключа + длина
 * JSON-стрингификации значения (так же, как считает сам Chrome).
 */
export function estimateItemBytes(key: string, value: unknown): number {
  return key.length + JSON.stringify(value).length;
}

/** Проверяет элемент против `QUOTA_BYTES_PER_ITEM`. */
export function checkItemQuota(key: string, value: unknown, limits: QuotaLimits): QuotaCheck {
  const bytes = estimateItemBytes(key, value);
  const limit = limits.QUOTA_BYTES_PER_ITEM;
  return bytes > limit
    ? { fits: false, bytes, limit, reason: 'item' }
    : { fits: true, bytes, limit };
}

/** Вход проверки общей квоты (после per-item). */
export interface TotalQuotaInput {
  readonly key: string;
  readonly value: unknown;
  /** Текущий общий занятый объём sync (байт). */
  readonly existingTotalBytes: number;
  /** Текущий вклад этого ключа (байт); 0, если ключа ещё нет. */
  readonly existingItemBytes: number;
  /** Текущее число элементов в sync. */
  readonly itemCount: number;
  /** Есть ли ключ уже в sync. */
  readonly hasKey: boolean;
}

/**
 * Полная проверка квоты для записи элемента: сначала per-item, затем общий объём и
 * число элементов (с учётом того, обновляем существующий ключ или добавляем новый).
 */
export function checkQuota(input: TotalQuotaInput, limits: QuotaLimits): QuotaCheck {
  const perItem = checkItemQuota(input.key, input.value, limits);
  if (!perItem.fits) return perItem;

  const nextTotal = input.existingTotalBytes - input.existingItemBytes + perItem.bytes;
  if (nextTotal > limits.QUOTA_BYTES) {
    return { fits: false, bytes: perItem.bytes, limit: limits.QUOTA_BYTES, reason: 'total' };
  }

  const nextCount = input.hasKey ? input.itemCount : input.itemCount + 1;
  if (nextCount > limits.MAX_ITEMS) {
    return { fits: false, bytes: perItem.bytes, limit: limits.MAX_ITEMS, reason: 'items' };
  }
  return { fits: true, bytes: perItem.bytes, limit: limits.QUOTA_BYTES };
}

/**
 * Типы фичи «Синк настроек и пресетов между устройствами» (TASK-029).
 *
 * Синк — только поверх `chrome.storage.sync` (аккаунт браузера пользователя, без
 * нашего бэкенда). Локальный слой (TASK-005) остаётся источником истины; sync
 * зеркалит только выбранные namespace'ы. Все типы здесь сериализуемы — они ходят
 * через `chrome.storage.sync` и через zod-схему настроек фичи.
 */

/**
 * Версия схемы конверта синка. Инкрементируется при несовместимом изменении
 * формата обёртки (не значения namespace'а — за него отвечает его собственный
 * слой настроек). Миграции конверта — в `logic.ts` (`parseEnvelope`).
 */
export const ENVELOPE_VERSION = 1 as const;

/**
 * Конверт синка: сырой блоб namespace'а + метаданные для LWW/миграций. Один
 * конверт = один элемент `chrome.storage.sync` (ключ `qatb.sync.<id>`).
 */
export interface SyncEnvelope<T = unknown> {
  /** Версия схемы конверта (для миграций формата обёртки). */
  readonly v: number;
  /** Момент последнего изменения значения (epoch ms) — ключ LWW. */
  readonly updatedAt: number;
  /** Сырой блоб настроек namespace'а (валидируется владельцем namespace'а). */
  readonly value: T;
}

/**
 * Миграция конверта с версии `from` на `from + 1`. Получает сырой кандидат-объект,
 * возвращает объект следующей версии. Только для структурных изменений обёртки.
 */
export interface EnvelopeMigration {
  readonly from: number;
  migrate(prev: Record<string, unknown>): Record<string, unknown>;
}

/** Лимиты квоты `chrome.storage.sync` (из платформенного seam). */
export interface QuotaLimits {
  readonly QUOTA_BYTES: number;
  readonly QUOTA_BYTES_PER_ITEM: number;
  readonly MAX_ITEMS: number;
}

/** Причина отказа по квоте: превышен размер элемента / общий / число элементов. */
export type QuotaReason = 'item' | 'total' | 'items';

/** Результат проверки квоты для одного элемента. */
export interface QuotaCheck {
  readonly fits: boolean;
  /** Оценённый размер этого элемента (ключ + JSON значения), байт. */
  readonly bytes: number;
  /** Применимый лимит (байт или число элементов — по `reason`). */
  readonly limit: number;
  /** Заполняется только при `fits === false`. */
  readonly reason?: QuotaReason;
}

/** Тип исхода слияния локального и удалённого конвертов. */
export type MergeKind = 'none' | 'equal' | 'local' | 'remote' | 'conflict';

/** Итог чистого LWW-слияния (без побочных эффектов). */
export interface MergeResult<T = unknown> {
  readonly kind: MergeKind;
  /** Победивший конверт (undefined только для `none`). */
  readonly winner?: SyncEnvelope<T>;
  /** Сторона-победитель (для `local`/`remote`/`conflict`). */
  readonly side?: 'local' | 'remote';
  /** true — обе стороны менялись с момента base (маркер «изменено на другом устройстве»). */
  readonly conflict: boolean;
}

/** Статус синхронизации одного namespace'а после прогона движка. */
export type SyncStatus =
  | 'idle' // нечего делать
  | 'pushed' // локальное отправлено в sync
  | 'pulled' // удалённое применено локально
  | 'equal' // стороны совпадают
  | 'conflict' // конфликт разрешён по LWW, выставлен маркер
  | 'quota' // не влезает в квоту — не синкается
  | 'error' // ошибка ввода-вывода/парсинга
  | 'unavailable'; // seam sync недоступен (грациозная деградация)

/** Исход синхронизации одного namespace'а. */
export interface SyncOutcome {
  readonly id: string;
  readonly status: SyncStatus;
  /** Есть ли неразрешённый конфликт (изменения на обоих устройствах). */
  readonly conflict: boolean;
  /** Проверка квоты (заполняется при `status === 'quota'` и при `estimate`). */
  readonly quota?: QuotaCheck;
}

/** Метаданные синка одного namespace'а (персистятся в локальных настройках фичи). */
export interface NamespaceSyncMeta {
  /** Выбран ли namespace для синка. */
  readonly selected: boolean;
  /** updatedAt последнего согласованного конверта (база детекта конфликта). 0 = никогда. */
  readonly baseUpdatedAt: number;
  /** Подпись (stableStringify) последнего согласованного значения. '' = никогда. */
  readonly baseSig: string;
  /** Есть ли маркер конфликта («изменено на другом устройстве»). */
  readonly conflict: boolean;
}

/** Персистентное состояние фичи (namespace настроек `settings-sync`). */
export interface SettingsSyncState {
  /** Глобальный тумблер синка — opt-in. */
  readonly enabled: boolean;
  /** Пользователь подтвердил, что прочитал предупреждение о приватности пресетов. */
  readonly ack: boolean;
  /** Момент последней успешной синхронизации (epoch ms). 0 = никогда. */
  readonly lastSyncAt: number;
  /** Метаданные по namespace'ам (ключ = id namespace'а). */
  readonly namespaces: Record<string, NamespaceSyncMeta>;
}

/** Дефолтная мета namespace'а (не выбран, никогда не синкали). */
export const DEFAULT_NAMESPACE_META: NamespaceSyncMeta = {
  selected: false,
  baseUpdatedAt: 0,
  baseSig: '',
  conflict: false,
};

/** Дефолтное состояние фичи: синк выключен. */
export const SETTINGS_SYNC_DEFAULTS: SettingsSyncState = {
  enabled: false,
  ack: false,
  lastSyncAt: 0,
  namespaces: {},
};

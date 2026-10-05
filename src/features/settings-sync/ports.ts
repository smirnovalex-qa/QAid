/**
 * Порты фичи «Синк настроек» (TASK-029): границы, за которые фича НЕ заходит.
 *
 * Логика и UI зависят ТОЛЬКО от этих портов + от платформенного seam
 * `storage.sync`. Так фича остаётся disjoint (не тянет `@/features/*` и не правит
 * `@/shared/storage`), полностью тестируемой (in-memory реализации в `__tests__`)
 * и грациозно деградирует при отсутствии `sync`.
 */

/** Описание синкаемого пространства настроек. `label` — ключ i18n. */
export interface SyncableNamespace {
  readonly id: string;
  readonly label: string;
  /** Пространство только для чтения (например, глобальные настройки приложения). */
  readonly readonly?: boolean;
  /**
   * Пространство может содержать введённые пользователем данные (пресеты) —
   * показать предупреждение о приватности перед синком.
   */
  readonly sensitive?: boolean;
}

/**
 * Порт доступа к локальным пространствам настроек. Реализация в проде читает/пишет
 * сырые блобы namespace'ов через публичный API `@/shared/storage` (её собирает
 * оркестратор в `instance.ts`); в тестах — in-memory.
 */
export interface NamespaceStore {
  /** Список синкаемых пространств (без секретных — они сюда не попадают). */
  list(): SyncableNamespace[];
  /** Сырой текущий блоб пространства (или `undefined`, если пусто/не заведено). */
  read(id: string): Promise<unknown>;
  /** Записать сырой блоб пространства локально (применение стянутого из sync). */
  write(id: string, value: unknown): Promise<void>;
}

/** Слушатель изменений `chrome.storage.sync` (форма как в платформенном seam). */
export type SyncChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
) => void;

/**
 * Платформенный seam `storage.sync` (его добавляет оркестратор в `@/platform`).
 * Фича зависит от этой формы, а не от `chrome.*` напрямую (ADR-0014).
 */
export interface StorageSyncSeam {
  get(keys?: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  getBytesInUse(keys?: string[] | null): Promise<number>;
  readonly onChanged: {
    addListener(cb: SyncChangeListener): void;
    removeListener(cb: SyncChangeListener): void;
  };
  readonly QUOTA_BYTES: number;
  readonly QUOTA_BYTES_PER_ITEM: number;
  readonly MAX_ITEMS: number;
}

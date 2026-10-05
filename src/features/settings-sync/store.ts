/**
 * Конкретный `NamespaceStore` над локальными пространствами настроек + каталог
 * синкаемых пространств (TASK-029).
 *
 * Store работает через инжектируемые «биндеры» (read/write сырого блоба
 * namespace'а) — чтобы фича НЕ импортировала `@/features/*` и НЕ правила
 * `@/shared/storage`. Биндеры собирает оркестратор в `instance.ts` из публичного
 * API слоя настроек. Секретные пространства (снимки storage/cookies, логи) в
 * каталог НЕ входят — они не синкаются никогда (см. `DEFAULT_EXCLUDED_NAMESPACES`).
 */
import type { NamespaceStore, SyncableNamespace } from './ports';

/** Пара read/write сырого блоба одного namespace'а. */
export interface RawNamespaceBinder {
  read(): Promise<unknown>;
  write(value: unknown): Promise<void>;
}

/**
 * Предлагаемый каталог синкаемых пространств. `label` — ключ i18n; `sensitive` —
 * пресеты с возможными пользовательскими данными (предупреждение о приватности).
 * Все влезают в квоту `sync` по размеру (тяжёлые артефакты сюда не попадают).
 */
export const SYNCABLE_NAMESPACE_CATALOG: readonly SyncableNamespace[] = [
  { id: 'app', label: 'ss.ns.app', readonly: false },
  { id: 'random-numbers', label: 'ss.ns.random-numbers', sensitive: true },
  { id: 'random-strings', label: 'ss.ns.random-strings', sensitive: true },
  { id: 'forms', label: 'ss.ns.forms', sensitive: true },
];

/**
 * Пространства, которые НИКОГДА не синкаются (default-excluded секреты, спец §3):
 * снимки storage/cookies (TASK-017/025) и журналы. Они не входят в каталог —
 * оркестратор не должен добавлять для них биндеры.
 */
export const DEFAULT_EXCLUDED_NAMESPACES: readonly string[] = [
  'storage-editor',
  // Профили сессий (TASK-047) содержат авторизационные токены (cookies/web storage) —
  // это секреты: они НИКОГДА не синкаются между устройствами (перенос — только ручным
  // экспортом/импортом файла профиля). Тот же принцип, что у снимков storage-editor.
  'session-profiles',
  'logs',
];

/**
 * Собирает `NamespaceStore` из каталога и карты биндеров. В список попадают только
 * те пространства каталога, для которых есть биндер (остальные ждут проводки
 * оркестратора) — так UI не показывает «мёртвых» строк.
 */
export function createNamespaceStore(
  catalog: readonly SyncableNamespace[],
  binders: Record<string, RawNamespaceBinder>,
): NamespaceStore {
  const bound = catalog.filter((n) => Object.prototype.hasOwnProperty.call(binders, n.id));
  return {
    list: (): SyncableNamespace[] => bound.map((n) => ({ ...n })),
    read: (id: string): Promise<unknown> => {
      const binder = binders[id];
      return binder ? binder.read() : Promise.resolve(undefined);
    },
    write: (id: string, value: unknown): Promise<void> => {
      const binder = binders[id];
      return binder ? binder.write(value) : Promise.resolve();
    },
  };
}

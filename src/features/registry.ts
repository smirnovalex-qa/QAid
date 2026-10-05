/**
 * Реестр фич — дескриптор возможностей (ADR-0011).
 *
 * Фича описывается единым `FeatureModule`, покрывающим все её пересечения с
 * системой (UI, сообщения, background-хендлеры, права, content/page, i18n,
 * события), и самопрописывается через `registerFeature`. Ядро подключает каждый
 * аспект генерически — фиче не нужно «дотягиваться» до background/манифеста/i18n
 * руками (инвариант расширяемости, ARCHITECTURE §1, §7).
 */
import type { ComponentType } from 'preact';
import type { AnyMessageDef } from '@/shared/messaging/registry';
import type { MessageMeta } from '@/shared/messaging/transports';
import type { PermissionRequest } from '@/shared/permissions';

export type FeatureCategory =
  'generators' | 'inspector' | 'storage' | 'environment' | 'forms' | 'utils' | 'mock';
export type Surface = 'popup' | 'sidepanel' | 'both';
export type Locale = 'ru' | 'en';

export interface BackgroundHandler {
  type: string;
  handler: (req: unknown, meta: MessageMeta) => Promise<unknown>;
}

/**
 * Тело фичи (`ui.tsx`). Оболочка редизайна может передать `subtab` — под-вкладку из
 * навигационной таксономии (семейства decode/time). Фичи без под-вкладок проп
 * игнорируют (сигнатура без параметров остаётся совместимой).
 */
export type FeatureComponent = ComponentType<{ subtab?: string | undefined }>;

/**
 * Ленивый загрузчик тела фичи (ADR-0047). Возвращает промис с `FeatureComponent`.
 * Дескриптор регистрируется жадно (метаданные для палитры/вкладок), а тело
 * (`ui.tsx` + его логика/зависимости) резолвится динамическим `import()` при первой
 * активации фичи в оболочке. Так точки входа (popup/sidepanel/SW/offscreen) не тянут
 * тела неоткрытых фич в свой начальный граф — см. `LazyPanel` в `src/ui/shell`.
 */
export type FeatureLoader = () => Promise<FeatureComponent>;

export interface FeatureModule {
  id: string; // 'jwt-decoder'
  title: string; // i18n-ключ
  category: FeatureCategory;
  icon?: ComponentType;
  order?: number;
  surface?: Surface;
  /**
   * Инструмент требует персистентную поверхность (живой захват элементов на
   * странице). В transient-popup — он закрывается при клике по странице — пикер
   * работать не может, поэтому popup рендерит fallback «открыть в side panel»
   * вместо сломанного UI. На доступность в списках НЕ влияет: фича остаётся видимой
   * на обеих поверхностях (`surface: 'both'`) и открываемой из палитры (ADR-0025).
   */
  requiresPanel?: boolean;
  /**
   * Ленивый загрузчик тела фичи (`() => import('./ui').then((m) => m.XPanel)`).
   * Метаданные регистрируются жадно, тело — по требованию (ADR-0047, F1 TASK-046).
   */
  load: FeatureLoader;

  // — опциональные вклады, подключаются ядром генерически —
  /**
   * Контракты сообщений фичи (federated protocol, ARCHITECTURE §5). Регистрируются
   * ЖАДНО (импорт `./messages` в `index.ts`): таблица контрактов — глобальная и не
   * зависит от того, какие тела фич загружены (фича может слать сообщение, чей
   * контракт объявлен в другой фиче). Ленивым делается только тело (`load`).
   */
  messages?: AnyMessageDef[];
  permissions?: PermissionRequest;
  content?: { world: 'ISOLATED' | 'MAIN'; injectOn: 'demand' };
  i18n?: Record<Locale, Record<string, string>>;
  events?: string[];
  teardown?: () => void;
}

const registry = new Map<string, FeatureModule>();

export function registerFeature(mod: FeatureModule): void {
  if (registry.has(mod.id)) throw new Error(`duplicate feature: ${mod.id}`);
  registry.set(mod.id, mod);
}

export function getFeatures(surface: 'popup' | 'sidepanel'): FeatureModule[] {
  return [...registry.values()]
    .filter((f) => (f.surface ?? 'both') === 'both' || f.surface === surface)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function allFeatures(): FeatureModule[] {
  return [...registry.values()];
}

// ——— Реестр фоновых вкладов (расцепление UI/background барелей, F6 TASK-046) ———
//
// Background-хендлеры фич живут в ОТДЕЛЬНОМ реестре от UI-дескриптора и наполняются
// ТОЛЬКО из background-барели (`@/features/background`), которую импортирует лишь
// service worker. Так граф popup/sidepanel не тянет фоновой код (перехватчики,
// DNR/CDP, offscreen-оркестрацию), а SW — не тянет тела `ui.tsx`. Инвариант
// расширяемости сохранён: добавление фичи с фоном = одна строка в background-барели
// (ARCHITECTURE §13). См. ADR-0047.

/** Вклад фичи в service worker: набор её background-хендлеров. */
export interface BackgroundContribution {
  /** id фичи-владельца (для дедупликации и диагностики). */
  id: string;
  handlers: BackgroundHandler[];
}

const backgroundRegistry = new Map<string, BackgroundContribution>();

/** Регистрирует фоновые хендлеры фичи (вызывается из `@/features/background`). */
export function registerBackground(id: string, handlers: BackgroundHandler[]): void {
  if (backgroundRegistry.has(id)) throw new Error(`duplicate background contribution: ${id}`);
  backgroundRegistry.set(id, { id, handlers });
}

/** Плоский список всех зарегистрированных фоновых хендлеров (для проводки в SW). */
export function allBackgroundHandlers(): BackgroundHandler[] {
  return [...backgroundRegistry.values()].flatMap((c) => c.handlers);
}

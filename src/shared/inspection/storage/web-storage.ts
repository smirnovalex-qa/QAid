/**
 * Content-мост web storage (TASK-017): читает/пишет `localStorage`/`sessionStorage`
 * активной вкладки в ISOLATED world по RPC `storage/*` (TASK-013).
 *
 * Живёт в `shared/inspection/storage` (а НЕ в `features/`), т.к. попадает в
 * content-бандл, который не должен импортировать фичи. Использует DOM-глобалы
 * страницы (`window.localStorage`/`sessionStorage`/`location`); `chrome.*` не
 * трогает — обмен идёт через `registerHandler` шины. Роутер поднимает инспекционный
 * content-хост в том же бандле (проводка — оркестратором); здесь только регистрация
 * доменных хендлеров.
 *
 * Импорт `./messages` (side-effect) кладёт zod-схемы `storage/*` в реестр content-реалма
 * — иначе роутер не провалидирует входящий запрос.
 */
import './messages';
import { registerHandler } from '@/shared/messaging/bus';
import type { RequestOf } from '@/shared/messaging/contract';
import type { WebStorageArea } from './types';

/** Выбирает объект `Storage` страницы по области запроса. */
function areaStorage(area: WebStorageArea): Storage {
  return area === 'session' ? window.sessionStorage : window.localStorage;
}

/** Снимает все пары ключ→значение области в порядке индексов `Storage`. */
function list(
  req: RequestOf<'storage/list'>,
): Promise<{ items: { key: string; value: string }[]; origin: string }> {
  const store = areaStorage(req.area);
  const items: { key: string; value: string }[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key === null) continue;
    items.push({ key, value: store.getItem(key) ?? '' });
  }
  return Promise.resolve({ items, origin: window.location.origin });
}

function set(req: RequestOf<'storage/set'>): Promise<{ ok: true }> {
  areaStorage(req.area).setItem(req.key, req.value);
  return Promise.resolve({ ok: true as const });
}

function remove(req: RequestOf<'storage/remove'>): Promise<{ ok: true }> {
  areaStorage(req.area).removeItem(req.key);
  return Promise.resolve({ ok: true as const });
}

function clear(req: RequestOf<'storage/clear'>): Promise<{ removed: number }> {
  const store = areaStorage(req.area);
  const removed = store.length;
  store.clear();
  return Promise.resolve({ removed });
}

/**
 * Хендлеры web storage. Экспортируются для прямого юнит-тестирования (без runtime):
 * те же функции регистрируются в шине из `installStorageContentHost`.
 */
export const storageHandlers = { list, set, remove, clear };

/** Установлен ли хост (шина не умеет разрегистрировать хендлеры — защита от повтора). */
let installed = false;

/**
 * Регистрирует хендлеры `storage/*` в шине content-реалма. Идемпотентно: повторная
 * инъекция бандла не пытается перерегистрировать хендлеры (`registerHandler` бросает
 * на дубликат). Роутер поднимает соседний инспекционный хост — здесь не дублируется.
 */
export function installStorageContentHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('storage/list', list);
  registerHandler('storage/set', set);
  registerHandler('storage/remove', remove);
  registerHandler('storage/clear', clear);
}

/**
 * Общие типы фичи «Состояние браузера: редактор storage/cookies» (TASK-017).
 *
 * Живут в `shared`, т.к. пересекают границу сред: поверхность (UI) шлёт запросы,
 * content-скрипт (web storage) и background (cookies) возвращают сериализуемые
 * описания. Все структуры JSON-сериализуемы — DOM/`Storage`-объекты через границу
 * не ходят, только их плоские снимки (ключ→значение / атрибуты cookie).
 */

/** Область web storage активной вкладки: `localStorage` или `sessionStorage`. */
export type WebStorageArea = 'local' | 'session';

/** Активная вкладка панели редактора (cookies + две области web storage). */
export type StorageTab = 'cookies' | 'local' | 'session';

/** Одна запись web storage — всегда пара строк (Storage хранит только строки). */
export interface StorageEntry {
  readonly key: string;
  readonly value: string;
}

/**
 * Статус `SameSite` cookie — тот же union, что у платформы
 * (`browser.cookies.SameSiteStatus`). `unspecified` — «браузер решает сам»
 * (при записи не передаётся в `chrome.cookies.set`).
 */
export type SameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict';

/** Все допустимые значения `SameSite` (для валидации/селекта). */
export const SAME_SITE_VALUES: readonly SameSite[] = [
  'unspecified',
  'no_restriction',
  'lax',
  'strict',
];

/**
 * Сериализуемый снимок одной cookie. Атрибуты приведены к плоскому виду для
 * отображения/правки; `expirationDate` — секунды с эпохи (как у `chrome.cookies`),
 * отсутствует у сессионных cookie.
 */
export interface CookieRecord {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: SameSite;
  /** Секунды с UNIX-эпохи; отсутствует → сессионная cookie. */
  readonly expirationDate?: number | undefined;
}

/**
 * Вход для записи cookie (`cookies/set`). Совпадает по форме с `CookieRecord`:
 * background сам соберёт корректный `url` из `secure`+`domain`+`path`
 * (см. `buildCookieUrl`) — `chrome.cookies.set` требует `url`, а не только домен.
 */
export type CookieInput = CookieRecord;

/**
 * Полный снимок состояния домена: cookies + обе области web storage. Экспортируется
 * как JSON и импортируется обратно (перенос сценария между стендами).
 */
export interface StorageSnapshot {
  readonly cookies: readonly CookieRecord[];
  readonly local: readonly StorageEntry[];
  readonly session: readonly StorageEntry[];
}

/** Персистентное состояние фичи (через слой настроек TASK-005) — активная вкладка. */
export interface StorageEditorSettingsState {
  readonly tab: StorageTab;
}

export const STORAGE_EDITOR_SETTINGS_DEFAULTS: StorageEditorSettingsState = {
  tab: 'cookies',
};

/**
 * Сериализуемые контракты фичи «Эмуляция окружения» (TASK-019).
 *
 * Все типы — plain-данные (переживают structured clone и передачу в MAIN-world
 * через аргументы `executeScript`). Никаких классов/функций/DOM-ссылок: конфиг
 * ходит из UI → background → инъекция в страницу как обычный объект.
 */

/** Режим геолокации: без подмены · заданные координаты · принудительная ошибка. */
export type GeoMode = 'off' | 'coords' | 'error';

/** Код ошибки геолокации (соответствует `GeolocationPositionError.code`). */
export type GeoErrorCode = 1 | 2 | 3; // PERMISSION_DENIED · POSITION_UNAVAILABLE · TIMEOUT

/** Конфиг геолокации для перехвата `navigator.geolocation.*` в MAIN-world. */
export interface GeoConfig {
  mode: GeoMode;
  latitude: number;
  longitude: number;
  /** Точность в метрах (`coords.accuracy`). */
  accuracy: number;
  /** Код, возвращаемый в режиме `error` (по умолчанию 1 — отказ). */
  errorCode: GeoErrorCode;
}

/**
 * Полный конфиг подмены окружения активной вкладки. `null` в поле = канал не
 * подменяется (least-surprise: без явного включения ничего не трогаем).
 */
export interface EnvironmentConfig {
  /** UA-строка или `null` (без подмены `User-Agent`/`navigator.userAgent`). */
  userAgent: string | null;
  /**
   * Значение заголовка `Accept-Language` (напр. `"fr-FR,fr;q=0.9,en;q=0.8"`) или
   * `null`. Из него же выводятся `navigator.language`/`languages` в MAIN-world.
   */
  acceptLanguage: string | null;
  /** IANA-таймзона (напр. `"Europe/Paris"`) или `null` (без подмены `Intl`/`Date`). */
  timezone: string | null;
  /** Геолокация. `mode: 'off'` = без подмены. */
  geo: GeoConfig;
}

/** Пара «имя=значение» query-профиля/фиче-флага с тумблером активности. */
export interface QueryFlag {
  key: string;
  value: string;
  /** Включён → добавить/обновить в URL; выключен → удалить из URL при применении. */
  enabled: boolean;
}

/** Пресет UA/языка/таймзоны/геолокации для быстрого выбора одним кликом. */
export interface EnvironmentPreset {
  id: string;
  /** i18n-ключ подписи. */
  labelKey: string;
}

export interface UserAgentPreset extends EnvironmentPreset {
  userAgent: string;
}

export interface LanguagePreset extends EnvironmentPreset {
  /** Полное значение `Accept-Language`. */
  acceptLanguage: string;
}

export interface TimezonePreset extends EnvironmentPreset {
  /** IANA-идентификатор. */
  timezone: string;
}

export interface GeoPreset extends EnvironmentPreset {
  latitude: number;
  longitude: number;
}

/**
 * Персистентное состояние фичи (namespace `environment`, ADR-0005): последний
 * конфиг + флаги + глобальный тумблер, чтобы восстановить сессию эмуляции при
 * повторном открытии панели.
 */
export interface EnvironmentSettingsState {
  enabled: boolean;
  config: EnvironmentConfig;
  flags: QueryFlag[];
}

/** DNR session-rule (подмена заголовков запроса). Плоский объект — строится в logic.ts. */
export interface HeaderRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    requestHeaders: { header: string; operation: 'set'; value: string }[];
  };
  condition: {
    tabIds: number[];
    resourceTypes: string[];
  };
}

/** Дефолтная (пустая) конфигурация — ничего не подменяется. */
export const EMPTY_GEO: GeoConfig = {
  mode: 'off',
  latitude: 0,
  longitude: 0,
  accuracy: 50,
  errorCode: 1,
};

export const EMPTY_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  userAgent: null,
  acceptLanguage: null,
  timezone: null,
  geo: EMPTY_GEO,
};

export const ENVIRONMENT_SETTINGS_DEFAULTS: EnvironmentSettingsState = {
  enabled: false,
  config: EMPTY_ENVIRONMENT_CONFIG,
  flags: [],
};

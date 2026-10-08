/**
 * MAIN-world оверрайды окружения (TASK-019). Эти функции инъектируются в контекст
 * страницы через `chrome.scripting.executeScript({ world: 'MAIN', func, args })` —
 * Chrome сериализует их как `func.toString()`, поэтому каждая ОБЯЗАНА быть
 * самодостаточной: только свой аргумент + глобалы страницы (`navigator`, `Intl`,
 * `Date`, `window`). Никаких импортов/общих хелперов в рантайме (отсюда осознанное
 * дублирование мелкой логики вроде разбора `Accept-Language`).
 *
 * Состояние храним на `window.__qatbEnvOverrides__` — набор undo-колбэков, чтобы
 * `clearEnvironmentOverrides` вернул страницу в исходное состояние, а повторный
 * apply не накладывался поверх (сначала restore, потом заново).
 *
 * Честное ограничение (задокументировано, ADR): полноценный TZ-override на уровне
 * движка `Date` без CDP невозможен — покрываем `Intl.DateTimeFormat` и
 * `Date.prototype.getTimezoneOffset`, чего хватает большинству web-сценариев.
 */
import type { EnvironmentConfig } from './types';

/** Форма нашего состояния на window (undo-колбэки текущей сессии эмуляции). */
interface OverrideState {
  restore: () => void;
}

/** Мутабельный вид geolocation для замены методов. */
interface MutableGeolocation {
  getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => void;
  watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => number;
}

/**
 * Применяет конфиг к странице (MAIN-world). Идемпотентно: если оверрайды уже
 * стоят — сперва снимаем их, затем накладываем заново. Каждая подмена
 * регистрирует свой undo; всё вместе кладётся на `window` для последующего снятия.
 */
export function applyEnvironmentOverrides(config: EnvironmentConfig): void {
  // ВАЖНО (ADR-0028): литерал ключа объявлен ВНУТРИ функции. Тело сериализуется в
  // MAIN-world через `func.toString()` без замыкания модуля — ссылка на константу
  // уровня модуля стала бы свободной и упала ReferenceError на странице.
  const STATE_KEY = '__qatbEnvOverrides__';
  const win = window as unknown as Record<string, OverrideState | undefined>;
  const existing = win[STATE_KEY];
  if (existing) existing.restore();

  const undo: (() => void)[] = [];
  const nav = navigator;

  // — User-Agent —
  if (config.userAgent !== null && config.userAgent.length > 0) {
    const value = config.userAgent;
    try {
      Object.defineProperty(nav, 'userAgent', { configurable: true, get: () => value });
      undo.push(() => {
        delete (nav as unknown as Record<string, unknown>).userAgent;
      });
    } catch {
      /* свойство неконфигурируемо в этой среде — пропускаем канал */
    }
  }

  // — Язык (navigator.language / languages) —
  if (config.acceptLanguage !== null && config.acceptLanguage.length > 0) {
    const seen = new Set<string>();
    const langs: string[] = [];
    for (const entry of config.acceptLanguage.split(',')) {
      const tag = entry.split(';')[0]?.trim();
      if (tag !== undefined && tag.length > 0 && !seen.has(tag)) {
        seen.add(tag);
        langs.push(tag);
      }
    }
    const primary = langs[0] ?? 'en';
    try {
      Object.defineProperty(nav, 'language', { configurable: true, get: () => primary });
      Object.defineProperty(nav, 'languages', { configurable: true, get: () => [...langs] });
      undo.push(() => {
        delete (nav as unknown as Record<string, unknown>).language;
        delete (nav as unknown as Record<string, unknown>).languages;
      });
    } catch {
      /* пропускаем канал */
    }
  }

  // — Геолокация — (geolocation отсутствует в небезопасном контексте — тогда пропуск)
  if (config.geo.mode !== 'off' && (nav.geolocation as Geolocation | undefined) !== undefined) {
    const geo = nav.geolocation as unknown as MutableGeolocation;
    // Сохраняем ИСХОДНЫЕ ссылки без bind: восстановление переприсваивает свойство
    // того же объекта (this берётся из места вызова), а bind при повторном
    // apply→restore наслаивал бы обёртки. Так restore возвращает точный оригинал.
    const origGet = geo.getCurrentPosition;
    const origWatch = geo.watchPosition;
    const g = config.geo;
    const makePosition = (): GeolocationPosition =>
      ({
        coords: {
          latitude: g.latitude,
          longitude: g.longitude,
          accuracy: g.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      }) as unknown as GeolocationPosition;
    const makeError = (): GeolocationPositionError =>
      ({
        code: g.errorCode,
        message: 'qaid: emulated geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      }) as unknown as GeolocationPositionError;
    const emulate = (success: PositionCallback, error?: PositionErrorCallback | null): void => {
      if (g.mode === 'coords') success(makePosition());
      else if (error) error(makeError());
    };
    geo.getCurrentPosition = emulate;
    geo.watchPosition = (success, error) => {
      emulate(success, error);
      return 0;
    };
    undo.push(() => {
      geo.getCurrentPosition = origGet;
      geo.watchPosition = origWatch;
    });
  }

  // — Таймзона (Intl.DateTimeFormat + Date.prototype.getTimezoneOffset) —
  if (config.timezone !== null && config.timezone.length > 0) {
    const tz = config.timezone;
    const OrigDTF = Intl.DateTimeFormat;
    const intlHost = Intl as unknown as { DateTimeFormat: unknown };

    // Обёртка: если timeZone не задан явно — подставляем эмулируемую зону.
    const PatchedDTF = function (
      this: unknown,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): Intl.DateTimeFormat {
      const opts: Intl.DateTimeFormatOptions = { ...options };
      opts.timeZone ??= tz;
      return new OrigDTF(locales, opts);
    };
    // Сохраняем prototype/статику оригинала (доступ к ним типизируем как запись,
    // чтобы обойти readonly у `typeof Intl.DateTimeFormat`).
    const patchedStatics = PatchedDTF as unknown as {
      prototype: unknown;
      supportedLocalesOf: unknown;
    };
    patchedStatics.prototype = OrigDTF.prototype;
    patchedStatics.supportedLocalesOf = OrigDTF.supportedLocalesOf.bind(OrigDTF);

    // Смещение зоны в минутах со знаком JS (getTimezoneOffset): local = UTC − offset.
    const offsetMinutes = (date: Date): number => {
      const dtf = new OrigDTF('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const parts: Record<string, string> = {};
      for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
      const asUTC = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      return Math.round((date.getTime() - asUTC) / 60_000);
    };
    // Захватываем оригинал, чтобы вернуть его в undo (не вызываем как unbound-метод —
    // только переприсваиваем; `this` в обёртке задаётся явно через `.call(this)`).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const origOffset = Date.prototype.getTimezoneOffset;
    try {
      intlHost.DateTimeFormat = PatchedDTF;
      Date.prototype.getTimezoneOffset = function (this: Date): number {
        try {
          return offsetMinutes(this);
        } catch {
          return origOffset.call(this);
        }
      };
      undo.push(() => {
        intlHost.DateTimeFormat = OrigDTF;
        Date.prototype.getTimezoneOffset = origOffset;
      });
    } catch {
      /* пропускаем канал */
    }
  }

  win[STATE_KEY] = {
    restore: () => {
      for (const fn of [...undo].reverse()) {
        try {
          fn();
        } catch {
          /* восстановление best-effort: одна ошибка не блокирует остальные */
        }
      }
      Reflect.deleteProperty(win, STATE_KEY);
    },
  };
}

/**
 * Снимает все оверрайды окружения со страницы (MAIN-world), возвращая
 * `navigator`/`Intl`/`geolocation` в исходное состояние. No-op, если эмуляция не
 * была применена.
 */
export function clearEnvironmentOverrides(): void {
  const STATE_KEY = '__qatbEnvOverrides__'; // самодостаточность injected-функции (ADR-0028)
  const win = window as unknown as Record<string, OverrideState | undefined>;
  win[STATE_KEY]?.restore();
}

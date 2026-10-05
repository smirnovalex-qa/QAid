/**
 * Чистая логика фичи «Эмуляция окружения» (TASK-019): валидация ввода, сборка
 * DNR-правил подмены заголовков и идемпотентное применение query-профиля к URL.
 *
 * Без DOM/chrome (ADR-0011): модуль тестируется изолированно и покрывается по
 * канону «core ~100%». Побочные эффекты (DNR-вызовы, инъекция) — в `background.ts`
 * и `overrides.ts`, которые лишь исполняют построенные здесь чистые объекты.
 */
import type { EnvironmentConfig, HeaderRule } from './types';

/** Ресурсы, к запросам которых применяем подмену заголовков (документ + подресурсы). */
export const HEADER_RESOURCE_TYPES: string[] = [
  'main_frame',
  'sub_frame',
  'xmlhttprequest',
  'script',
  'stylesheet',
  'image',
  'font',
  'media',
  'websocket',
  'other',
];

/**
 * База идентификаторов session-rules. Фича — единственный потребитель DNR, id
 * детерминирован по вкладке (`BASE + tabId`), чтобы повторный apply переписывал
 * правило той же вкладки, а не плодил дубликаты. DNR требует положительный int.
 */
export const RULE_ID_BASE = 900_000;

/** Детерминированный id session-rule для вкладки. */
export function headerRuleId(tabId: number): number {
  return RULE_ID_BASE + tabId;
}

/**
 * UA-строка валидна: непустая, разумной длины и без управляющих символов
 * (CR/LF/NUL) — защита от инъекции заголовка при передаче в DNR.
 */
export function isValidUserAgent(ua: string): boolean {
  if (ua.length === 0 || ua.length > 1024) return false;
  return !/[\r\n\0]/.test(ua);
}

/** BCP-47 (упрощённо): базовый язык (2–3 буквы) + опциональные субтеги. */
export function isValidLanguageTag(tag: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(tag);
}

/**
 * `Accept-Language` валиден: непустой список записей `tag` / `tag;q=0.x`, каждый
 * тег — валидный BCP-47, вес `q` (при наличии) — число в [0, 1].
 */
export function isValidAcceptLanguage(value: string): boolean {
  const entries = value.split(',').map((e) => e.trim());
  if (entries.length === 0 || entries.some((e) => e.length === 0)) return false;
  return entries.every((entry) => {
    const [tag, ...params] = entry.split(';').map((p) => p.trim());
    if (tag === undefined || !isValidLanguageTag(tag)) return false;
    if (params.length === 0) return true;
    // Допустим ровно один параметр — вес качества `q=<0..1>` (дубли `q` невалидны).
    if (params.length > 1) return false;
    const match = /^q=(\d(?:\.\d{1,3})?)$/.exec(params[0] ?? '');
    if (!match) return false;
    const q = Number(match[1]);
    return q >= 0 && q <= 1;
  });
}

/**
 * Выводит `navigator.languages` из `Accept-Language`: базовые теги в порядке
 * следования, без дублей и без веса `q`. Для `navigator.language` берётся первый.
 */
export function deriveLanguages(acceptLanguage: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of acceptLanguage.split(',')) {
    const tag = entry.split(';')[0]?.trim();
    if (tag === undefined || tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Широта в градусах: [-90, 90]. */
export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/** Долгота в градусах: [-180, 180]. */
export function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** Точность в метрах: конечное неотрицательное число. */
export function isValidAccuracy(accuracy: number): boolean {
  return Number.isFinite(accuracy) && accuracy >= 0;
}

/**
 * IANA-таймзона валидна, если её принимает `Intl.DateTimeFormat` (единственный
 * переносимый способ проверки без внешней таблицы зон). Пустая строка/мусор —
 * `RangeError`, ловим и возвращаем false.
 */
export function isValidTimeZone(tz: string): boolean {
  if (tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Строит DNR session-rules подмены заголовков для вкладки. Включает только те
 * заголовки, которые заданы и валидны (least-surprise). Пустой результат —
 * подменять нечего, вызывающий снимает правило вкладки.
 */
export function buildHeaderRules(config: EnvironmentConfig, tabId: number): HeaderRule[] {
  const requestHeaders: HeaderRule['action']['requestHeaders'] = [];
  if (config.userAgent !== null && isValidUserAgent(config.userAgent)) {
    requestHeaders.push({ header: 'user-agent', operation: 'set', value: config.userAgent });
  }
  if (config.acceptLanguage !== null && isValidAcceptLanguage(config.acceptLanguage)) {
    requestHeaders.push({
      header: 'accept-language',
      operation: 'set',
      value: config.acceptLanguage,
    });
  }
  if (requestHeaders.length === 0) return [];
  return [
    {
      id: headerRuleId(tabId),
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders },
      condition: { tabIds: [tabId], resourceTypes: HEADER_RESOURCE_TYPES },
    },
  ];
}

/**
 * Есть ли в конфиге что-либо для подмены на уровне страницы (MAIN-world): UA,
 * язык, таймзона или активная геолокация. Если нет — инъекцию можно пропустить.
 */
export function hasPageOverrides(config: EnvironmentConfig): boolean {
  return (
    config.userAgent !== null ||
    config.acceptLanguage !== null ||
    config.timezone !== null ||
    config.geo.mode !== 'off'
  );
}

/**
 * Применяет query-профиль к URL идемпотентно: включённые флаги `set`'ятся
 * (замена, не дублирование), выключенные — удаляются. Непарсибельный URL
 * возвращается без изменений (инструмент не роняет навигацию).
 */
export function applyQueryProfile(
  url: string,
  flags: { key: string; value: string; enabled: boolean }[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const flag of flags) {
    if (flag.key.length === 0) continue;
    if (flag.enabled) parsed.searchParams.set(flag.key, flag.value);
    else parsed.searchParams.delete(flag.key);
  }
  return parsed.toString();
}

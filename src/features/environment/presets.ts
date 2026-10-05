/**
 * Данные пресетов эмуляции (TASK-019). Вынесены из логики/UI — чистые константы,
 * переиспользуемые панелью и тестами. Значения UA — реальные строки популярных
 * платформ; список намеренно короткий (частые кейсы QA), кастом всегда доступен.
 */
import type { GeoPreset, LanguagePreset, TimezonePreset, UserAgentPreset } from './types';

export const USER_AGENT_PRESETS: UserAgentPreset[] = [
  {
    id: 'ua-chrome-win',
    labelKey: 'environment.ua.preset.chromeWin',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  {
    id: 'ua-safari-mac',
    labelKey: 'environment.ua.preset.safariMac',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  },
  {
    id: 'ua-safari-ios',
    labelKey: 'environment.ua.preset.safariIos',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'ua-chrome-android',
    labelKey: 'environment.ua.preset.chromeAndroid',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  },
  {
    id: 'ua-googlebot',
    labelKey: 'environment.ua.preset.googlebot',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  },
];

export const LANGUAGE_PRESETS: LanguagePreset[] = [
  { id: 'lang-en-us', labelKey: 'environment.lang.preset.enUs', acceptLanguage: 'en-US,en;q=0.9' },
  {
    id: 'lang-ru-ru',
    labelKey: 'environment.lang.preset.ruRu',
    acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.8',
  },
  {
    id: 'lang-de-de',
    labelKey: 'environment.lang.preset.deDe',
    acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
  },
  {
    id: 'lang-fr-fr',
    labelKey: 'environment.lang.preset.frFr',
    acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.8',
  },
  {
    id: 'lang-ja-jp',
    labelKey: 'environment.lang.preset.jaJp',
    acceptLanguage: 'ja-JP,ja;q=0.9,en;q=0.8',
  },
];

export const TIMEZONE_PRESETS: TimezonePreset[] = [
  { id: 'tz-utc', labelKey: 'environment.tz.preset.utc', timezone: 'UTC' },
  { id: 'tz-la', labelKey: 'environment.tz.preset.la', timezone: 'America/Los_Angeles' },
  { id: 'tz-ny', labelKey: 'environment.tz.preset.ny', timezone: 'America/New_York' },
  { id: 'tz-london', labelKey: 'environment.tz.preset.london', timezone: 'Europe/London' },
  { id: 'tz-paris', labelKey: 'environment.tz.preset.paris', timezone: 'Europe/Paris' },
  { id: 'tz-moscow', labelKey: 'environment.tz.preset.moscow', timezone: 'Europe/Moscow' },
  { id: 'tz-tokyo', labelKey: 'environment.tz.preset.tokyo', timezone: 'Asia/Tokyo' },
];

export const GEO_PRESETS: GeoPreset[] = [
  { id: 'geo-sf', labelKey: 'environment.geo.preset.sf', latitude: 37.7749, longitude: -122.4194 },
  { id: 'geo-ny', labelKey: 'environment.geo.preset.ny', latitude: 40.7128, longitude: -74.006 },
  {
    id: 'geo-london',
    labelKey: 'environment.geo.preset.london',
    latitude: 51.5074,
    longitude: -0.1278,
  },
  {
    id: 'geo-paris',
    labelKey: 'environment.geo.preset.paris',
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: 'geo-moscow',
    labelKey: 'environment.geo.preset.moscow',
    latitude: 55.7558,
    longitude: 37.6173,
  },
  {
    id: 'geo-tokyo',
    labelKey: 'environment.geo.preset.tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
  },
];

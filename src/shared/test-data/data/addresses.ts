/**
 * Курируемые таблицы адресных компонентов по локалям (TASK-034).
 *
 * Данные, НЕ логика. Минимум под тест-нужды (не географическая точность —
 * см. TASK-034, вне scope: региональные адресные базы).
 */
import type { Locale } from '../types';

/** Улицы по локали. */
export const STREETS: Record<Locale, readonly string[]> = {
  en: ['Main', 'Oak', 'Park', 'Elm', 'Maple', 'Cedar', 'Pine', 'Lake', 'Hill', 'River'],
  ru: [
    'Ленина',
    'Садовая',
    'Пушкина',
    'Мира',
    'Гагарина',
    'Советская',
    'Центральная',
    'Школьная',
    'Лесная',
    'Молодёжная',
  ],
};

/** Города по локали. */
export const CITIES: Record<Locale, readonly string[]> = {
  en: [
    'Springfield',
    'Riverside',
    'Franklin',
    'Greenville',
    'Bristol',
    'Clinton',
    'Fairview',
    'Salem',
  ],
  ru: [
    'Москва',
    'Санкт-Петербург',
    'Новосибирск',
    'Екатеринбург',
    'Казань',
    'Самара',
    'Пермь',
    'Воронеж',
  ],
};

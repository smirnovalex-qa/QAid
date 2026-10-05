/**
 * Курируемые таблицы имён/фамилий по локалям (TASK-034).
 *
 * Данные, НЕ логика: добавление локали — это новый ключ в записи, генераторы
 * (`identity.ts`) не меняются. Наборы намеренно небольшие (тест-нужды, не
 * демографическая полнота).
 */
import type { Locale } from '../types';

/** Имена по локали. */
export const FIRST_NAMES: Record<Locale, readonly string[]> = {
  en: ['Alex', 'Maria', 'John', 'Elena', 'David', 'Anna', 'Chris', 'Nina', 'Paul', 'Sara'],
  ru: ['Иван', 'Мария', 'Сергей', 'Ольга', 'Дмитрий', 'Анна', 'Пётр', 'Нина', 'Алексей', 'Дарья'],
};

/** Фамилии по локали. */
export const LAST_NAMES: Record<Locale, readonly string[]> = {
  en: [
    'Smith',
    'Johnson',
    'Brown',
    'Miller',
    'Wilson',
    'Davis',
    'Clark',
    'Novak',
    'Walker',
    'Young',
  ],
  ru: [
    'Иванов',
    'Петров',
    'Соколов',
    'Кузнецов',
    'Смирнов',
    'Попов',
    'Новиков',
    'Морозов',
    'Волков',
    'Козлов',
  ],
};

/**
 * Курируемые почтовые домены для генератора email (TASK-034).
 *
 * Полные домены (с TLD) — так `email()` собирает адрес без спецлогики по TLD.
 * Данные, НЕ логика.
 */

/** Домены для тест-email (безопасные/зарезервированные под примеры). */
export const EMAIL_DOMAINS: readonly string[] = [
  'example.com',
  'example.org',
  'test.dev',
  'demo.io',
  'sample.net',
  'mail.example',
];

/** Слова-основы для локальной части адреса. */
export const EMAIL_LOCAL_WORDS: readonly string[] = [
  'user',
  'test',
  'qa',
  'demo',
  'account',
  'inbox',
];

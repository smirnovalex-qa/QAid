/**
 * Экспорт табличных значений в текстовые форматы (plain / json / csv).
 *
 * Чистый модуль без зависимостей от фреймворка: фичи передают строки/числа,
 * получают готовую строку для копирования или скачивания. CSV следует RFC 4180
 * и защищается от CSV-инъекций (см. `escapeCsvField`).
 */

export type ExportFormat = 'plain' | 'json' | 'csv';

export interface ExportInput {
  readonly rows: readonly (string | number)[];
  /** Разделитель для plain-формата, по умолчанию `'\n'`. */
  readonly separator?: string;
  /** Заголовок первой строки CSV, по умолчанию `'value'`. */
  readonly header?: string;
}

/** Символы, при наличии которых значение начинает исполняться как формула в Excel/Sheets. */
const CSV_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Экранирует одно поле CSV по RFC 4180 — единственный источник правды для CSV.
 *
 * Правила: поле оборачивается в двойные кавычки, если содержит `,` `"` `\r`
 * `\n` или имеет ведущий/замыкающий пробел; внутренние `"` удваиваются (`""`).
 * Защита от инъекций: если значение НАЧИНАЕТСЯ с `=` `+` `-` `@` `\t` `\r`,
 * перед экранированием добавляется одинарная кавычка `'` (нейтрализует формулу).
 */
export function escapeCsvField(field: string): string {
  let value = field;

  // Защита от CSV-инъекций — только внутри CSV, до кавычек.
  // charAt даёт '' для пустой строки, поэтому отдельная проверка длины не нужна.
  if (CSV_INJECTION_PREFIXES.includes(value.charAt(0))) {
    value = `'${value}`;
  }

  const needsQuoting =
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\r') ||
    value.includes('\n') ||
    value.startsWith(' ') ||
    value.endsWith(' ');

  if (!needsQuoting) return value;

  return `"${value.replaceAll('"', '""')}"`;
}

/** Соединяет строки разделителем (по умолчанию перевод строки). Числа — через `String`. */
export function toPlainText(input: ExportInput): string {
  const separator = input.separator ?? '\n';
  return input.rows.map((r) => String(r)).join(separator);
}

/** Сериализует значения в JSON с отступом; числа сохраняют свой тип (не строки). */
export function toJSON(input: ExportInput): string {
  return JSON.stringify(input.rows, null, 2);
}

/**
 * Строит одностолбцовый CSV: заголовок первой строкой, значения ниже.
 * Строки разделены `\r\n`; финальная строка БЕЗ завершающего перевода строки.
 */
export function toCSV(input: ExportInput): string {
  const header = input.header ?? 'value';
  const lines = [escapeCsvField(header), ...input.rows.map((r) => escapeCsvField(String(r)))];
  return lines.join('\r\n');
}

/** Диспетчер: выбирает формат экспорта. */
export function toExport(input: ExportInput, format: ExportFormat): string {
  switch (format) {
    case 'plain':
      return toPlainText(input);
    case 'json':
      return toJSON(input);
    case 'csv':
      return toCSV(input);
  }
}

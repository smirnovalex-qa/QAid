import { describe, it, expect } from 'vitest';
import { escapeCsvField, toCSV, toJSON, toPlainText, toExport } from '@/shared/export/export';

describe('escapeCsvField', () => {
  it('оставляет простое значение без кавычек', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('оборачивает значение с запятой', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('удваивает внутренние кавычки и оборачивает', () => {
    expect(escapeCsvField('a"b')).toBe('"a""b"');
  });

  it('оборачивает значение с переводом строки (\\n)', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"');
  });

  it('оборачивает значение с возвратом каретки (\\r)', () => {
    expect(escapeCsvField('a\rb')).toBe('"a\rb"');
  });

  it('оборачивает значение с ведущим пробелом', () => {
    expect(escapeCsvField(' a')).toBe('" a"');
  });

  it('оборачивает значение с замыкающим пробелом', () => {
    expect(escapeCsvField('a ')).toBe('"a "');
  });

  it('нейтрализует формулу с ведущим = (CSV-инъекция)', () => {
    expect(escapeCsvField('=1+1')).toBe('=1+1'.replace('=', "'="));
  });

  it('добавляет кавычку и оборачивает при @ + запятой', () => {
    expect(escapeCsvField('@cmd,x')).toBe('"\'@cmd,x"');
  });

  it('нейтрализует префиксы +, -, @, \\t, \\r', () => {
    expect(escapeCsvField('+x')).toBe("'+x");
    expect(escapeCsvField('-5')).toBe("'-5");
    expect(escapeCsvField('@x')).toBe("'@x");
    // Табуляция нейтрализуется префиксом, но не требует кавычек по RFC 4180.
    expect(escapeCsvField('\tx')).toBe("'\tx");
  });

  it('пустое значение остаётся пустым', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('toPlainText', () => {
  it('соединяет строки переводом строки по умолчанию', () => {
    expect(toPlainText({ rows: ['a', 'b', 'c'] })).toBe('a\nb\nc');
  });

  it('использует кастомный разделитель', () => {
    expect(toPlainText({ rows: [1, 2, 3], separator: ', ' })).toBe('1, 2, 3');
  });

  it('сохраняет отрицательные числа без экранирования', () => {
    expect(toPlainText({ rows: [-5, -10] })).toBe('-5\n-10');
  });

  it('пустой список даёт пустую строку', () => {
    expect(toPlainText({ rows: [] })).toBe('');
  });
});

describe('toJSON', () => {
  it('сериализует с отступом 2', () => {
    expect(toJSON({ rows: ['a', 'b'] })).toBe('[\n  "a",\n  "b"\n]');
  });

  it('сохраняет числовой тип (не строки)', () => {
    expect(toJSON({ rows: [1, -5, 3.14] })).toBe('[\n  1,\n  -5,\n  3.14\n]');
  });

  it('пустой список — пустой массив', () => {
    expect(toJSON({ rows: [] })).toBe('[]');
  });
});

describe('toCSV', () => {
  it('ставит заголовок первой строкой, значения через CRLF, без финального перевода', () => {
    expect(toCSV({ rows: ['a', 'b'] })).toBe('value\r\na\r\nb');
  });

  it('использует кастомный заголовок', () => {
    expect(toCSV({ rows: [1, 2], header: 'num' })).toBe('num\r\n1\r\n2');
  });

  it('экранирует значения с запятой', () => {
    expect(toCSV({ rows: ['a,b'] })).toBe('value\r\n"a,b"');
  });

  it('защищает от CSV-инъекции в значениях', () => {
    expect(toCSV({ rows: ['=SUM(A1)'] })).toBe("value\r\n'=SUM(A1)");
  });

  it('только заголовок при пустом списке (без завершающего перевода)', () => {
    expect(toCSV({ rows: [] })).toBe('value');
  });
});

describe('toExport', () => {
  it('диспетчеризует plain', () => {
    expect(toExport({ rows: ['a', 'b'] }, 'plain')).toBe('a\nb');
  });

  it('диспетчеризует json', () => {
    expect(toExport({ rows: [1] }, 'json')).toBe('[\n  1\n]');
  });

  it('диспетчеризует csv', () => {
    expect(toExport({ rows: ['x'] }, 'csv')).toBe('value\r\nx');
  });
});

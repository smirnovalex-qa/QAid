/**
 * Входы JSON с синтаксическими ошибками и ожидаемой позицией.
 *
 * `offset` — 0-based индекс провинившегося символа, который V8 сообщает в
 * сообщении об ошибке (`at position N`); `line`/`column` — 1-based, выведенные
 * из offset подсчётом переводов строк.
 */
export interface JsonErrorCase {
  readonly name: string;
  readonly input: string;
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export const JSON_ERROR_CASES: readonly JsonErrorCase[] = [
  // Висячая запятая перед ']' — V8 указывает на ']' (индекс 5).
  { name: 'trailing comma in array', input: '[1,2,]', offset: 5, line: 1, column: 6 },
  // Обрыв ввода — позиция в конце строки (индекс 1).
  { name: 'unexpected end', input: '{', offset: 1, line: 1, column: 2 },
];

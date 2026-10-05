/**
 * Общие фикстуры невалидного JSON с ожидаемой позицией ошибки — единая точка для
 * фиче-тестов. Каноничные кейсы лежат рядом с фичей декодеров и реэкспортируются
 * здесь для обнаружимости (см. tests/README.md).
 */
export type { JsonErrorCase } from '../../src/features/decoders/__tests__/fixtures/json.errors';
export { JSON_ERROR_CASES } from '../../src/features/decoders/__tests__/fixtures/json.errors';

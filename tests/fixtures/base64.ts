/**
 * Общие Base64-фикстуры (RFC 4648 §10) — единая точка для фиче-тестов.
 * Каноничные данные лежат рядом с фичей декодеров и реэкспортируются здесь для
 * обнаружимости (см. tests/README.md, раздел «Фикстуры»).
 */
export {
  RFC4648_VECTORS,
  UNICODE_SAMPLES,
} from '../../src/features/decoders/__tests__/fixtures/base64.vectors';

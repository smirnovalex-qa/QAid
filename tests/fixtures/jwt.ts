/**
 * Общие JWT-фикстуры — единая точка для фиче-тестов. Каноничные образцы и билдер
 * `makeJwt` лежат рядом с фичей декодеров и реэкспортируются здесь для
 * обнаружимости (см. tests/README.md).
 */
export {
  makeJwt,
  NOW_SECONDS,
  VALID_JWT,
  UNICODE_JWT,
  EXPIRED_JWT,
  NOT_YET_VALID_JWT,
  UNSECURED_JWT,
  TWO_SEGMENTS,
  BAD_BASE64_SEGMENT,
  NON_OBJECT_PAYLOAD,
} from '../../src/features/decoders/__tests__/fixtures/jwt.samples';

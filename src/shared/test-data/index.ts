/**
 * Барель слоя генераторов тест-данных `@/shared/test-data` (TASK-034).
 *
 * Единая точка входа для потребителей (формы TASK-020 и будущие пресет-фичи):
 * доменные генераторы (email/ФИО/адрес/телефон/дата) и «умные» валидные значения
 * (карта по Луну, IBAN по mod-97, UUID v4 по RFC-4122). Всё — чистое, на
 * инъектируемом `RandomSource`; данные-локали расширяются таблицами в `data/`.
 */
export type { CardScheme, IbanCountry, Locale, PhoneCountry } from './types';

export { address, email, firstName, fullName, lastName } from './identity';
export { phone } from './phone';
export { dateInRange, toIsoDate } from './datetime';
export { cardNumber, iban, isUuidV4, isValidIban, isValidLuhn, uuidV4 } from './smart';

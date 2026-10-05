/**
 * Известные векторы хеш-функций для фиче-тестов timestamp-hash (TASK-010).
 * Значения — общеизвестные (RFC/NIST/FIPS), проверяемые независимо.
 */

export interface HashVector {
  readonly input: string;
  readonly hex: string;
}

/** SHA-1 (FIPS 180). */
export const SHA1_VECTORS: readonly HashVector[] = [
  { input: '', hex: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
  { input: 'abc', hex: 'a9993e364706816aba3e25717850c26c9cd0d89d' },
];

/** SHA-256 (FIPS 180-4). */
export const SHA256_VECTORS: readonly HashVector[] = [
  { input: '', hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  { input: 'abc', hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
];

/** SHA-384 (FIPS 180-4). */
export const SHA384_VECTORS: readonly HashVector[] = [
  {
    input: 'abc',
    hex:
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed' +
      '8086072ba1e7cc2358baeca134c825a7',
  },
];

/** SHA-512 (FIPS 180-4). */
export const SHA512_VECTORS: readonly HashVector[] = [
  {
    input: 'abc',
    hex:
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
      '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  },
];

/** MD5 (RFC 1321, §A.5) — только для legacy-совместимости, небезопасен. */
export const MD5_VECTORS: readonly HashVector[] = [
  { input: '', hex: 'd41d8cd98f00b204e9800998ecf8427e' },
  { input: 'abc', hex: '900150983cd24fb0d6963f7d28e17f72' },
  { input: 'message digest', hex: 'f96b697d7cb7938d525a2f31aaf161d0' },
];

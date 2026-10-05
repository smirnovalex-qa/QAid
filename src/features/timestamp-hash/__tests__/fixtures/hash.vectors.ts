/**
 * Контрольные векторы хешей (known-answer). Значения — из RFC/NIST и
 * общеизвестных наборов; служат «золотым эталоном» для чистой логики.
 */
import type { ShaAlgo } from '../../types';

export interface ShaVector {
  algo: ShaAlgo;
  input: string;
  hex: string;
}

export const SHA_VECTORS: ShaVector[] = [
  // Пустая строка.
  { algo: 'SHA-1', input: '', hex: 'da39a3ee5e6b4b0d3255bfef95601890afd80709' },
  {
    algo: 'SHA-256',
    input: '',
    hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  // "abc" — классические векторы FIPS 180.
  { algo: 'SHA-1', input: 'abc', hex: 'a9993e364706816aba3e25717850c26c9cd0d89d' },
  {
    algo: 'SHA-256',
    input: 'abc',
    hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  },
  {
    algo: 'SHA-384',
    input: 'abc',
    hex:
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed' +
      '8086072ba1e7cc2358baeca134c825a7',
  },
  {
    algo: 'SHA-512',
    input: 'abc',
    hex:
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
      '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  },
];

export interface Md5Vector {
  input: string;
  hex: string;
}

export const MD5_VECTORS: Md5Vector[] = [
  { input: '', hex: 'd41d8cd98f00b204e9800998ecf8427e' },
  { input: 'abc', hex: '900150983cd24fb0d6963f7d28e17f72' },
  { input: 'The quick brown fox jumps over the lazy dog', hex: '9e107d9d372bb6826bd81d3542a419d6' },
  { input: 'message digest', hex: 'f96b697d7cb7938d525a2f31aaf161d0' },
];

/**
 * Ключи хранилища QAid.
 *
 * Формат: `qatb:v<schemaVersion>:<namespace>:<key>`,
 * напр. `qatb:v2:random-numbers:last`. Единый префикс позволяет отличать
 * наши ключи от чужих значений в `chrome.storage.local`.
 */

/** Префикс всех наших ключей. */
export const KEY_PREFIX = 'qatb';

/** Разделитель сегментов ключа. */
const SEP = ':';

/** Разобранный ключ хранилища. */
export interface ParsedKey {
  readonly schemaVersion: number;
  readonly namespace: string;
  readonly key: string;
}

/** Число из цифр без знака — валидный сегмент версии после `v`. */
const VERSION_BODY = /^\d+$/;

/**
 * Собирает строковый ключ хранилища.
 *
 * @param schemaVersion Версия схемы (неотрицательное целое).
 * @param namespace Пространство имён; не должно содержать ':'.
 * @param key Ключ внутри пространства; не должен содержать ':'.
 * @returns Ключ вида `qatb:v<schemaVersion>:<namespace>:<key>`.
 * @throws {Error} Если namespace или key содержат ':'.
 */
export function buildKey(schemaVersion: number, namespace: string, key: string): string {
  if (namespace.includes(SEP)) {
    throw new Error(`namespace не должен содержать '${SEP}': "${namespace}"`);
  }
  if (key.includes(SEP)) {
    throw new Error(`key не должен содержать '${SEP}': "${key}"`);
  }
  return `${KEY_PREFIX}${SEP}v${String(schemaVersion)}${SEP}${namespace}${SEP}${key}`;
}

/**
 * Разбирает строковый ключ обратно в компоненты.
 *
 * @param raw Произвольная строка-ключ.
 * @returns Компоненты ключа или `null`, если строка не является нашим ключом.
 */
export function parseKey(raw: string): ParsedKey | null {
  const parts = raw.split(SEP);
  if (parts.length !== 4) {
    return null;
  }
  const [prefix, version, namespace, key] = parts;
  if (prefix !== KEY_PREFIX) {
    return null;
  }
  if (!version?.startsWith('v')) {
    return null;
  }
  const body = version.slice(1);
  if (!VERSION_BODY.test(body)) {
    return null;
  }
  if (namespace === undefined || key === undefined) {
    return null;
  }
  return { schemaVersion: Number(body), namespace, key };
}

/**
 * Дешёвая проверка принадлежности ключа нам (без полного разбора).
 *
 * @param raw Произвольная строка-ключ.
 * @returns `true`, если строка начинается с `qatb:`.
 */
export function isOwnedKey(raw: string): boolean {
  return raw.startsWith(`${KEY_PREFIX}${SEP}`);
}

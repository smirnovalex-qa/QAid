/**
 * Вывод версии расширения из semver (`package.json.version`).
 *
 * Chrome-манифест допускает до 4 dot-separated чисел, каждое 0–65535, и **не**
 * принимает pre-release semver (`0.1.0-beta.1`). Здесь мы отбрасываем
 * pre-release/build-суффиксы и нормализуем ядро до трёх числовых компонентов.
 * Полный semver сохраняется отдельно в `version_name`.
 */

/** Максимум одного компонента версии Chrome-манифеста. */
const MAX_COMPONENT = 65_535;

/** Число из цифр (без знака/точек) — валидный компонент версии. */
const NUMERIC_COMPONENT = /^\d+$/;

/** Сколько числовых компонентов оставляем (major.minor.patch). */
const COMPONENT_COUNT = 3;

/**
 * Преобразует semver-строку в валидную для Chrome версию `major.minor.patch`.
 *
 * @param semver Значение `package.json.version`, напр. `'0.1.0'` или `'1.2.3-beta.4'`.
 * @returns Три числовых компонента через точку, напр. `'0.1.0'`.
 * @throws {RangeError} Если компонент не является числом или превышает 65535.
 */
export function toExtensionVersion(semver: string): string {
  const core = semver.split('-')[0] ?? '';
  const rawParts = core.split('.');
  const parts: number[] = [];

  for (let i = 0; i < COMPONENT_COUNT; i += 1) {
    const token = rawParts[i] ?? '0';
    if (!NUMERIC_COMPONENT.test(token)) {
      throw new RangeError(
        `Некорректная версия "${semver}": компонент "${token}" не является числом`,
      );
    }
    const value = Number(token);
    if (value > MAX_COMPONENT) {
      throw new RangeError(
        `Некорректная версия "${semver}": компонент ${String(value)} превышает ${String(MAX_COMPONENT)}`,
      );
    }
    parts.push(value);
  }

  return parts.join('.');
}

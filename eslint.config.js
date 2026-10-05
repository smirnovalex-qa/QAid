import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Node-глобалы для тулинг-скриптов (без зависимости `globals`). */
const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.husky/**',
      'playwright-report/**',
      'test-results/**',
      // Дев-харнесс визуального превью поверхностей: не входит в сборку расширения
      // (нет в манифесте), имитирует chrome.* — вне правил приложения.
      'src/_preview/**',
      'preview.html',
    ],
  },

  js.configs.recommended,

  // --- Type-aware правила: только исходники приложения (src/**) ---
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },

  // Граница платформы (ADR-0014): прямой доступ к WebExtensions API разрешён
  // только через адаптер `src/platform` и тонкие транспорты `shared/messaging`.
  // Surface-код (background/popup/sidepanel/content/page) переведён на адаптер
  // в TASK-003, поэтому исключений, кроме этих двух модулей, больше нет.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/**', 'src/shared/messaging/transports.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'chrome', message: 'Доступ к chrome.* — только через src/platform (ADR-0014).' },
        { name: 'browser', message: 'Доступ к browser.* — только через src/platform (ADR-0014).' },
      ],
    },
  },

  // Тестовые файлы: часть type-checked правил избыточна и шумна в тестах.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Ложноположительно на mock-объектах (vi.fn как метод): передача ссылки
      // на метод в expect(...) — штатный паттерн ассертов.
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Харнес-код (tests/**: setup, моки, фикстуры, e2e). Типы проверяет tsc через
  // tsconfig.test.json, поэтому здесь — без type-aware анализа (не требуем
  // принадлежности файла к project service). `no-undef` выключен: неопределённые
  // идентификаторы ловит TS, а браузерные/Node-глобалы здесь легитимны.
  {
    files: ['tests/**/*.{ts,tsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: false, project: false },
    },
    rules: {
      'no-undef': 'off',
      // Базовый no-unused-vars ложно срабатывает на именах параметров в типовых
      // сигнатурах; неиспользуемые идентификаторы ловит tsc (tsconfig.test.json).
      'no-unused-vars': 'off',
      'no-empty-pattern': 'off', // Playwright-фикстуры: `async ({}, use) => …`.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // --- Тулинг/конфиги (Node): без type-aware анализа, типы проверяет tsc
  // через tsconfig.node.json. Отвязываем от project service, чтобы парсер
  // не требовал принадлежности файла к tsconfig.
  {
    files: [
      '*.config.{js,ts}',
      'eslint.config.js',
      'commitlint.config.js',
      'scripts/**/*.{js,mjs}',
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parser: tseslint.parser,
      globals: nodeGlobals,
      parserOptions: { projectService: false, project: false },
    },
  },

  prettier,
);

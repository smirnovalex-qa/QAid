import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/features/**/logic.ts',
        // Чистый GIF-кодировщик (TASK-037) — критичный самодельный код, гейтим наравне
        // с logic.ts (round-trip тест + высокий порог покрытия).
        'src/features/screen-recording/gif.ts',
        'src/shared/**',
        'src/ui/**',
        'src/i18n/**',
      ],
      // Оболочки/энтри, тестовые файлы и типовые декларации в порог не входят.
      exclude: ['**/__tests__/**', 'src/**/*.d.ts', 'src/ui/DevGallery.tsx'],
      thresholds: {
        // Общий гейт — канон PRD (§12): ≥80% core по всем метрикам.
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        // Чистая доменная логика — почти-100% по строкам/функциям (канон «core ~100%»).
        // Branch-порог — enforced floor, а не 95: остаток ветвления в logic.ts — это
        // защитные `?? default` и catch-и на непроходимых путях (движок гарантирует
        // определённость). Гнать их до 95% искусственными тестами/фейками вредно;
        // содержательный high-bar несут statements/functions/lines. См. ADR-0018.
        'src/features/**/logic.ts': {
          statements: 95,
          functions: 95,
          lines: 95,
          branches: 68,
        },
        // Самодельный GIF-кодировщик (TASK-037): строки/функции почти-100%; branch-порог —
        // floor (остаток — недостижимые `undefined`-гварды типизированных массивов,
        // навязанные noUncheckedIndexedAccess, и защитные ветви min/max). ADR-0018/0045.
        'src/features/screen-recording/gif.ts': {
          statements: 95,
          functions: 95,
          lines: 95,
          branches: 68,
        },
        // Разделяемое ядро. Строки/линии — ратчет 90 (TASK-021): транспортный
        // chrome-seam `transports.ts` (reply/reject-ветки windowTransport) и
        // reject-ветка `useSettings` покрыты юнит-тестами, порог поднят 88→90.
        // Функции/ветки — floor: остаток defensive-ветвей + chrome-seam. ADR-0018.
        'src/shared/**': {
          statements: 88,
          functions: 82,
          lines: 90,
          branches: 55,
        },
      },
    },
  },
});

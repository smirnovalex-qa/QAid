// Подключает типы матчеров @testing-library/jest-dom к vitest `expect` в рамках
// TS-программы. `vitest.setup.ts` лежит вне tsconfig `include: ["src"]`, поэтому
// без этого файла type-aware ESLint видит toBeInTheDocument/toHaveAttribute/… как
// `any` и падает на no-unsafe-call. Реальная регистрация матчеров — в setup.
import '@testing-library/jest-dom/vitest';

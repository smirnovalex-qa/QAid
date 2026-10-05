/** Фикстуры для тестов инспектора шрифтов (TASK-016). */
import type { FontSample } from '../../types';

/** Строит сэмпл с разумными дефолтами, переопределяемыми точечно. */
export function makeSample(overrides: Partial<FontSample> = {}): FontSample {
  return {
    selector: 'p',
    family: 'Inter',
    fallbackChain: ['Inter', 'sans-serif'],
    fontSize: '16px',
    fontWeight: '400',
    fontStyle: 'normal',
    lineHeight: '24px',
    letterSpacing: 'normal',
    text: 'Hello',
    ...overrides,
  };
}

/** Набор сэмплов с двумя семействами и разными размерами/весами. */
export const SAMPLE_SET: readonly FontSample[] = [
  makeSample({ selector: 'h1#title', family: 'Inter', fontSize: '32px', fontWeight: '700' }),
  makeSample({ selector: 'p.lead', family: 'Inter', fontSize: '16px', fontWeight: '400' }),
  makeSample({ selector: 'p.lead + p', family: 'Inter', fontSize: '14px', fontWeight: '400' }),
  makeSample({
    selector: 'code',
    family: 'monospace',
    fallbackChain: ['monospace'],
    fontSize: '13px',
    fontWeight: '400',
    fontStyle: 'italic',
  }),
];

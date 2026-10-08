import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/shared/logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('prefixes each level with [qaid]', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      const spy = vi.spyOn(console, level).mockImplementation(() => undefined);
      logger[level]('msg', 1);
      expect(spy).toHaveBeenCalledWith('[qaid]', 'msg', 1);
    }
  });

  it('logs debug in non-prod (test env)', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    logger.debug('x');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

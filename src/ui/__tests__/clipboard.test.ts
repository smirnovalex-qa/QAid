import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '@/ui/clipboard';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const okFlag = await copyText('hello');
    expect(okFlag).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when Clipboard API throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const exec = vi.fn().mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand = exec as typeof document.execCommand;
    const okFlag = await copyText('world');
    expect(okFlag).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('skips the async Clipboard API (no policy violation) when clipboard-write is blocked', async () => {
    // Permissions Policy запрещает clipboard-write (cross-origin iframe без allow) —
    // copyText НЕ должен вызывать navigator.clipboard.writeText, иначе браузер
    // напечатает violation в консоль. Должен сразу уйти в legacy execCommand.
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const exec = vi.fn().mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand = exec as typeof document.execCommand;
    const allowsFeature = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, 'featurePolicy', {
      value: { allowsFeature },
      configurable: true,
    });
    try {
      const okFlag = await copyText('blocked');
      expect(okFlag).toBe(true);
      expect(allowsFeature).toHaveBeenCalledWith('clipboard-write');
      expect(writeText).not.toHaveBeenCalled();
      expect(exec).toHaveBeenCalledWith('copy');
    } finally {
      delete (document as { featurePolicy?: unknown }).featurePolicy;
    }
  });
});

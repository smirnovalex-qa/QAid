import { describe, expect, it } from 'vitest';
import { toExtensionVersion } from '@/shared/version';

describe('toExtensionVersion', () => {
  it('passes through a clean three-part version', () => {
    expect(toExtensionVersion('0.1.0')).toBe('0.1.0');
    expect(toExtensionVersion('12.34.56')).toBe('12.34.56');
  });

  it('strips a pre-release suffix', () => {
    expect(toExtensionVersion('0.1.0-beta.1')).toBe('0.1.0');
    expect(toExtensionVersion('1.2.3-rc.10+build.7')).toBe('1.2.3');
  });

  it('pads missing components with zeros', () => {
    expect(toExtensionVersion('1')).toBe('1.0.0');
    expect(toExtensionVersion('1.2')).toBe('1.2.0');
  });

  it('accepts the maximum component value', () => {
    expect(toExtensionVersion('65535.65535.65535')).toBe('65535.65535.65535');
  });

  it('rejects non-numeric components', () => {
    expect(() => toExtensionVersion('1.x.0')).toThrow(RangeError);
    expect(() => toExtensionVersion('1.2abc.0')).toThrow(RangeError);
  });

  it('rejects components above the Chrome limit', () => {
    expect(() => toExtensionVersion('65536.0.0')).toThrow(RangeError);
  });
});

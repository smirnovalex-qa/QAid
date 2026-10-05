import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { allMessageTypes, defineMessage, getMessageDef } from '@/shared/messaging/registry';

describe('messaging registry', () => {
  it('defineMessage registers schemas retrievable by type', () => {
    const def = defineMessage('reg:a', z.object({ x: z.number() }), z.object({ y: z.number() }));
    expect(def.type).toBe('reg:a');
    expect(getMessageDef('reg:a')).toBe(def);
    expect(allMessageTypes()).toContain('reg:a');
  });

  it('unknown type returns undefined', () => {
    expect(getMessageDef('reg:nope')).toBeUndefined();
  });

  it('throws on duplicate type', () => {
    defineMessage('reg:dup', z.object({}), z.object({}));
    expect(() => defineMessage('reg:dup', z.object({}), z.object({}))).toThrow(
      /duplicate message type/,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { FloatingPanelOpen, floatingPanelMessages } from '@/shared/panel/messages';
import { getMessageDef } from '@/shared/messaging/registry';

describe('floating-panel messages', () => {
  it('floating-panel/open is a background-targeted contract', () => {
    expect(FloatingPanelOpen.type).toBe('floating-panel/open');
    expect(FloatingPanelOpen.target).toBe('background');
  });

  it('validates the request shape (tabId: non-negative int)', () => {
    expect(FloatingPanelOpen.request.safeParse({ tabId: 7 }).success).toBe(true);
    expect(FloatingPanelOpen.request.safeParse({ tabId: -1 }).success).toBe(false);
    expect(FloatingPanelOpen.request.safeParse({ tabId: 1.5 }).success).toBe(false);
    expect(FloatingPanelOpen.request.safeParse({}).success).toBe(false);
  });

  it('validates the response shape ({ ok: true })', () => {
    expect(FloatingPanelOpen.response.safeParse({ ok: true }).success).toBe(true);
    expect(FloatingPanelOpen.response.safeParse({ ok: false }).success).toBe(false);
  });

  it('registers itself in the global message registry (importable contract)', () => {
    expect(getMessageDef('floating-panel/open')).toBeDefined();
    expect(floatingPanelMessages).toContain(FloatingPanelOpen);
  });
});

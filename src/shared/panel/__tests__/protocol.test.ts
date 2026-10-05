import { describe, expect, it } from 'vitest';
import {
  FromPanelSchema,
  ToPanelSchema,
  decodePanelMessage,
  encodePanelMessage,
  PANEL_MARKER,
} from '@/shared/panel/protocol';

const NONCE = 'nonce-abc-123';

describe('panel protocol: encode/decode', () => {
  it('round-trips a valid message with the matching nonce', () => {
    const wire = encodePanelMessage(NONCE, { type: 'ready' });
    expect(decodePanelMessage(wire, NONCE, FromPanelSchema)).toEqual({ type: 'ready' });
  });

  it('round-trips a resize message carrying optional size', () => {
    const wire = encodePanelMessage(NONCE, { type: 'resize', width: 420 });
    expect(decodePanelMessage(wire, NONCE, FromPanelSchema)).toEqual({
      type: 'resize',
      width: 420,
    });
  });

  it('round-trips a wrapper → iframe state message', () => {
    const wire = encodePanelMessage(NONCE, { type: 'state', collapsed: true, width: 400 });
    expect(decodePanelMessage(wire, NONCE, ToPanelSchema)).toEqual({
      type: 'state',
      collapsed: true,
      width: 400,
    });
  });

  it('ignores a message whose nonce does not match (page script spoofing)', () => {
    const wire = encodePanelMessage('attacker-nonce', { type: 'close' });
    expect(decodePanelMessage(wire, NONCE, FromPanelSchema)).toBeNull();
  });

  it('ignores a message with no nonce at all', () => {
    const raw = { [PANEL_MARKER]: true, msg: { type: 'close' } };
    expect(decodePanelMessage(raw, NONCE, FromPanelSchema)).toBeNull();
  });

  it('ignores a foreign object without our marker', () => {
    expect(
      decodePanelMessage({ nonce: NONCE, msg: { type: 'close' } }, NONCE, FromPanelSchema),
    ).toBeNull();
    expect(decodePanelMessage('hello', NONCE, FromPanelSchema)).toBeNull();
    expect(decodePanelMessage(null, NONCE, FromPanelSchema)).toBeNull();
  });

  it('ignores a message whose body fails the schema (unknown type)', () => {
    const wire = encodePanelMessage(NONCE, { type: 'evil' } as never);
    expect(decodePanelMessage(wire, NONCE, FromPanelSchema)).toBeNull();
  });

  it('does not accept a wrapper-only type on the iframe→wrapper schema', () => {
    const wire = encodePanelMessage(NONCE, {
      type: 'state',
      collapsed: false,
      width: 380,
    } as never);
    expect(decodePanelMessage(wire, NONCE, FromPanelSchema)).toBeNull();
  });
});

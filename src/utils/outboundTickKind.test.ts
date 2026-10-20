import { describe, expect, it } from 'vitest';
import { outboundTickKind } from './outboundTickKind';

describe('outboundTickKind', () => {
  it('paints a played voice note as read', () => {
    expect(outboundTickKind('played')).toBe('read');
    expect(outboundTickKind('READ')).toBe('read');
  });

  it('keeps the list check when the preview has no status yet', () => {
    expect(outboundTickKind(undefined, { emptyAs: 'sent' })).toBe('sent');
    expect(outboundTickKind(null)).toBe('pending');
    expect(outboundTickKind('pending')).toBe('pending');
  });
});

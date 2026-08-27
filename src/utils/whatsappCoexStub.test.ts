import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_ORPHAN_STATUS_STUB,
  conversationPreviewText,
  isCommercialOrphanStatusStub,
  quotedMessagePreview,
} from './whatsappCoexStub';

describe('whatsappCoexStub', () => {
  it('detects the Meta status stub', () => {
    expect(isCommercialOrphanStatusStub(COMMERCIAL_ORPHAN_STATUS_STUB)).toBe(true);
    expect(isCommercialOrphanStatusStub('Como va doña francy')).toBe(false);
  });

  it('does not preview the stub as chat text', () => {
    expect(conversationPreviewText(COMMERCIAL_ORPHAN_STATUS_STUB)).toBe('Mensaje desde la app');
    expect(conversationPreviewText('Como va doña francy')).toBe('Como va doña francy');
    expect(quotedMessagePreview(COMMERCIAL_ORPHAN_STATUS_STUB)).toBe('Mensaje desde la app');
  });
});

import { describe, expect, it } from 'vitest';
import type { MetaSessionWindow } from '../../supabase/functions/_shared/metaSessionWindow';
import type {
  BookingContextResult,
  SuggestReplyResult,
} from './whatsappService';

const sessionWindow: MetaSessionWindow = {
  status: 'closed',
  lastInboundAt: '2026-08-04T12:00:00.000Z',
  expiresAt: '2026-08-05T12:00:00.000Z',
  requiresTemplate: true,
};

describe('Inbox AI response contracts', () => {
  it('exposes sessionWindow from suggestion responses', () => {
    const result: SuggestReplyResult = {
      suggestion: null,
      lastMessageIsOutbound: true,
      sessionWindow,
    };

    expect(result.sessionWindow).toEqual(sessionWindow);
  });

  it('exposes sessionWindow from booking context responses', () => {
    const result: BookingContextResult = {
      bookingContext: null,
      sessionWindow,
    };

    expect(result.sessionWindow.requiresTemplate).toBe(true);
  });
});

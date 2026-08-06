import { describe, expect, it } from 'vitest';
import type { MetaSessionWindow } from '../../supabase/functions/_shared/metaSessionWindow';
import type {
  BookingContextResult,
  InboxAiProposedAction,
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
      proposedActions: [],
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

  it('exposes typed proposed actions from suggestion responses', () => {
    const action: InboxAiProposedAction = {
      id: 'code-owned-id',
      type: 'apply_tag',
      label: 'Aplicar etiqueta',
      reason: 'El cliente mostró interés',
      requiresConfirmation: true,
      payload: { tagName: 'Interesado' },
    };
    const result: SuggestReplyResult = {
      suggestion: 'Respuesta',
      proposedActions: [action],
      lastMessageIsOutbound: false,
      sessionWindow,
    };

    expect(result.proposedActions).toEqual([action]);
  });
});

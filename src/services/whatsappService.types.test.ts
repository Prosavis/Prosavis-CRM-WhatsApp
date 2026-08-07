import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetaSessionWindow } from '../../supabase/functions/_shared/metaSessionWindow';
import {
  executeInboxAiAction,
  suggestWhatsAppAgentReply,
  type BookingContextResult,
  type InboxAiProposedAction,
  type SuggestReplyResult,
} from './whatsappService';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/config/supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

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

  it('maps proposedActions received from the Edge Function', async () => {
    const action: InboxAiProposedAction = {
      id: '52d68cfe-6ab7-4f80-b0ef-c827dec80887',
      type: 'apply_tag',
      label: 'Aplicar etiqueta',
      reason: 'El cliente mostró interés',
      requiresConfirmation: true,
      payload: { tagName: 'Interesado' },
    };
    invokeMock.mockResolvedValueOnce({
      data: {
        suggestion: 'Respuesta recibida',
        proposedActions: [action],
        lastMessageIsOutbound: false,
        sessionWindow,
      },
      error: null,
    });

    const result = await suggestWhatsAppAgentReply('stable-key-1');

    expect(invokeMock).toHaveBeenCalledWith('suggest-whatsapp-agent-reply', {
      body: {
        stableKey: 'stable-key-1',
        forceGenerate: false,
        includeVoiceTranscriptions: false,
      },
    });
    expect(result.proposedActions).toEqual([action]);
  });

  it('maps historyMeta and conversationTags from suggestion responses', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        suggestion: null,
        proposedActions: [],
        lastMessageIsOutbound: true,
        sessionWindow,
        historyMeta: {
          loaded: 10,
          truncated: true,
          oldestAt: '2026-08-01T00:00:00.000Z',
          newestAt: '2026-08-05T00:00:00.000Z',
        },
        conversationTags: ['VIP'],
      },
      error: null,
    });

    const result = await suggestWhatsAppAgentReply('stable-key-1');
    expect(result.historyMeta?.truncated).toBe(true);
    expect(result.conversationTags).toEqual(['VIP']);
  });

  it('invokes execute-inbox-ai-action with fingerprint metadata', async () => {
    const action: InboxAiProposedAction = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      type: 'apply_tag',
      label: 'Aplicar etiqueta',
      reason: 'motivo',
      requiresConfirmation: true,
      payload: { tagName: 'VIP' },
    };
    invokeMock.mockResolvedValueOnce({
      data: {
        success: true,
        result: {
          type: 'apply_tag',
          tagId: 'tag-1',
          tagName: 'VIP',
          tagIds: ['tag-1'],
          alreadyPresent: false,
          suggestionFingerprint: 'fp_abc',
        },
      },
      error: null,
    });

    const result = await executeInboxAiAction('stable-key-1', action, {
      suggestionFingerprint: 'fp_abc',
      wabaId: 'waba-1',
    });

    expect(invokeMock).toHaveBeenCalledWith('execute-inbox-ai-action', {
      body: {
        stableKey: 'stable-key-1',
        action,
        suggestionFingerprint: 'fp_abc',
        wabaId: 'waba-1',
      },
    });
    expect(result).toMatchObject({ type: 'apply_tag', tagName: 'VIP' });
  });
});

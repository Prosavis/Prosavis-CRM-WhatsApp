import { describe, expect, it } from 'vitest';
import type { WhatsAppMessage } from '@/services/whatsappService';
import {
  conversationMessageHistoryReducer,
  createConversationMessageHistoryState,
  selectConversationMessages,
  selectLoadedConversationInbound,
} from './conversationMessageHistory';

function message(
  id: string,
  direction: WhatsAppMessage['direction'],
  createdAt: string,
): WhatsAppMessage {
  return {
    id,
    direction,
    senderType: direction === 'inbound' ? 'user' : 'agent',
    status: direction === 'inbound' ? 'received' : 'sent',
    createdAt: new Date(createdAt),
  };
}

describe('conversation message history switching', () => {
  it('never emits conversation A history as conversation B during A → B switching', () => {
    let state = createConversationMessageHistoryState('conversation-a', 'stable-a');
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      messages: [
        message('a-inbound', 'inbound', '2026-08-05T10:00:00.000Z'),
        message('a-outbound', 'outbound', '2026-08-05T10:30:00.000Z'),
      ],
    });

    expect(
      selectLoadedConversationInbound(state, 'conversation-a', 'stable-a')
        ?.lastInboundAt?.toISOString(),
    ).toBe('2026-08-05T10:00:00.000Z');

    expect(
      selectLoadedConversationInbound(state, 'conversation-b', 'stable-b'),
    ).toBeNull();
    expect(
      selectConversationMessages(state, 'conversation-b', 'stable-b'),
    ).toEqual([]);

    state = conversationMessageHistoryReducer(state, {
      type: 'started',
      conversationId: 'conversation-b',
      historyKey: 'stable-b',
    });

    expect(
      selectLoadedConversationInbound(state, 'conversation-b', 'stable-b'),
    ).toBeNull();

    const waitingForB = state;
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      messages: [
        message('late-a-inbound', 'inbound', '2026-08-05T11:00:00.000Z'),
      ],
    });

    expect(state).toBe(waitingForB);
    expect(
      selectLoadedConversationInbound(state, 'conversation-b', 'stable-b'),
    ).toBeNull();

    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-b',
      historyKey: 'stable-b',
      messages: [
        message('b-inbound', 'inbound', '2026-08-05T12:00:00.000Z'),
      ],
    });

    const loadedB = selectLoadedConversationInbound(
      state,
      'conversation-b',
      'stable-b',
    );
    expect(loadedB?.conversationId).toBe('conversation-b');
    expect(loadedB?.lastInboundAt?.toISOString()).toBe(
      '2026-08-05T12:00:00.000Z',
    );
  });
});

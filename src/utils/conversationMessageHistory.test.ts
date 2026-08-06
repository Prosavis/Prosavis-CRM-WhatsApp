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
    let state = createConversationMessageHistoryState(
      'conversation-a',
      'stable-a',
      1,
    );
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 1,
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
      subscriptionId: 2,
    });

    expect(
      selectLoadedConversationInbound(state, 'conversation-b', 'stable-b'),
    ).toBeNull();

    const waitingForB = state;
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 1,
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
      subscriptionId: 2,
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

  it('ignores a late callback from an older same-key subscription', () => {
    let state = createConversationMessageHistoryState(
      'conversation-a',
      'stable-a',
      1,
    );
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 1,
      messages: [
        message('first-generation', 'inbound', '2026-08-05T10:00:00.000Z'),
      ],
    });
    state = conversationMessageHistoryReducer(state, {
      type: 'started',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 2,
    });

    const waitingForSecondGeneration = state;
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 1,
      messages: [
        message('late-first-generation', 'inbound', '2026-08-05T11:00:00.000Z'),
      ],
    });

    expect(state).toBe(waitingForSecondGeneration);
    expect(
      selectLoadedConversationInbound(state, 'conversation-a', 'stable-a'),
    ).toBeNull();

    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 2,
      messages: [
        message('second-generation', 'inbound', '2026-08-05T12:00:00.000Z'),
      ],
    });

    expect(
      selectLoadedConversationInbound(state, 'conversation-a', 'stable-a')
        ?.lastInboundAt?.toISOString(),
    ).toBe('2026-08-05T12:00:00.000Z');
  });

  it('rejects callbacks from both prior generations after A → B → A', () => {
    let state = createConversationMessageHistoryState(
      'conversation-a',
      'stable-a',
      1,
    );
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 1,
      messages: [
        message('a-first', 'inbound', '2026-08-05T10:00:00.000Z'),
      ],
    });
    state = conversationMessageHistoryReducer(state, {
      type: 'started',
      conversationId: 'conversation-b',
      historyKey: 'stable-b',
      subscriptionId: 2,
    });
    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-b',
      historyKey: 'stable-b',
      subscriptionId: 2,
      messages: [
        message('b-current', 'inbound', '2026-08-05T11:00:00.000Z'),
      ],
    });
    state = conversationMessageHistoryReducer(state, {
      type: 'started',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 3,
    });

    const waitingForReturnedA = state;
    for (const staleAction of [
      {
        type: 'loaded' as const,
        conversationId: 'conversation-a',
        historyKey: 'stable-a',
        subscriptionId: 1,
        messages: [
          message('late-a-first', 'inbound', '2026-08-05T12:00:00.000Z'),
        ],
      },
      {
        type: 'loaded' as const,
        conversationId: 'conversation-b',
        historyKey: 'stable-b',
        subscriptionId: 2,
        messages: [
          message('late-b', 'inbound', '2026-08-05T12:30:00.000Z'),
        ],
      },
    ]) {
      state = conversationMessageHistoryReducer(state, staleAction);
    }

    expect(state).toBe(waitingForReturnedA);
    expect(
      selectLoadedConversationInbound(state, 'conversation-a', 'stable-a'),
    ).toBeNull();

    state = conversationMessageHistoryReducer(state, {
      type: 'loaded',
      conversationId: 'conversation-a',
      historyKey: 'stable-a',
      subscriptionId: 3,
      messages: [
        message('a-returned', 'inbound', '2026-08-05T13:00:00.000Z'),
      ],
    });

    expect(
      selectLoadedConversationInbound(state, 'conversation-a', 'stable-a')
        ?.lastInboundAt?.toISOString(),
    ).toBe('2026-08-05T13:00:00.000Z');
  });
});

import type { WhatsAppMessage } from '@/services/whatsappService';
import {
  getLoadedConversationInbound,
  type LoadedConversationInbound,
} from './whatsappTemplateSuggestions';

type ConversationMessageHistoryStatus = 'loading' | 'loaded' | 'error';

export interface ConversationMessageHistoryState {
  conversationId: string;
  historyKey: string;
  messages: WhatsAppMessage[];
  status: ConversationMessageHistoryStatus;
}

export type ConversationMessageHistoryAction =
  | {
      type: 'started';
      conversationId: string;
      historyKey: string;
    }
  | {
      type: 'loaded';
      conversationId: string;
      historyKey: string;
      messages: WhatsAppMessage[];
    }
  | {
      type: 'failed';
      conversationId: string;
      historyKey: string;
    };

const EMPTY_MESSAGES: WhatsAppMessage[] = [];

export function createConversationMessageHistoryState(
  conversationId: string,
  historyKey: string,
): ConversationMessageHistoryState {
  return {
    conversationId,
    historyKey,
    messages: EMPTY_MESSAGES,
    status: 'loading',
  };
}

function actionMatchesCurrentHistory(
  state: ConversationMessageHistoryState,
  action: Pick<ConversationMessageHistoryAction, 'conversationId' | 'historyKey'>,
): boolean {
  return (
    state.conversationId === action.conversationId &&
    state.historyKey === action.historyKey
  );
}

export function conversationMessageHistoryReducer(
  state: ConversationMessageHistoryState,
  action: ConversationMessageHistoryAction,
): ConversationMessageHistoryState {
  switch (action.type) {
    case 'started':
      return createConversationMessageHistoryState(
        action.conversationId,
        action.historyKey,
      );
    case 'loaded':
      if (!actionMatchesCurrentHistory(state, action)) return state;
      return {
        conversationId: action.conversationId,
        historyKey: action.historyKey,
        messages: action.messages,
        status: 'loaded',
      };
    case 'failed':
      if (!actionMatchesCurrentHistory(state, action)) return state;
      return {
        ...state,
        status: 'error',
      };
    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

function stateMatchesActiveHistory(
  state: ConversationMessageHistoryState,
  conversationId: string,
  historyKey: string,
): boolean {
  return (
    state.conversationId === conversationId &&
    state.historyKey === historyKey
  );
}

export function selectConversationMessages(
  state: ConversationMessageHistoryState,
  conversationId: string,
  historyKey: string,
): WhatsAppMessage[] {
  return stateMatchesActiveHistory(state, conversationId, historyKey)
    ? state.messages
    : EMPTY_MESSAGES;
}

export function isConversationMessageHistoryLoading(
  state: ConversationMessageHistoryState,
  conversationId: string,
  historyKey: string,
): boolean {
  return (
    !stateMatchesActiveHistory(state, conversationId, historyKey) ||
    state.status === 'loading'
  );
}

export function selectLoadedConversationInbound(
  state: ConversationMessageHistoryState,
  conversationId: string,
  historyKey: string,
): LoadedConversationInbound | null {
  if (
    !stateMatchesActiveHistory(state, conversationId, historyKey) ||
    state.status !== 'loaded'
  ) {
    return null;
  }

  return getLoadedConversationInbound(
    state.conversationId,
    state.messages.filter((message) => !message.reactionTo),
  );
}

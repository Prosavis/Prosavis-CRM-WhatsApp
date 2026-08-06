import { jsonResponse } from './cors.ts';
import {
  generateInboxAiSuggestion,
  type InboxAiActionGrounding,
} from './inboxAiActions.ts';
import type { ConversationHistoryMeta } from './conversationHistory.ts';
import type { MetaSessionWindow } from './metaSessionWindow.ts';

interface InboxAiResponseContext {
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  sessionWindow: MetaSessionWindow;
}

export function createLastOutboundInboxAiSuggestionResponse(
  context: InboxAiResponseContext,
): Response {
  return jsonResponse({
    suggestion: null,
    proposedActions: [],
    lastMessageIsOutbound: true,
    hint: 'El último mensaje es saliente. Usa forceGenerate para redactar igualmente.',
    historyMeta: context.historyMeta,
    conversationTags: context.conversationTags,
    sessionWindow: context.sessionWindow,
  });
}

export async function createGeneratedInboxAiSuggestionResponse(params: {
  apiKey: string;
  systemInstruction: string;
  contextPrompt: string;
  grounding: InboxAiActionGrounding;
  responseContext: InboxAiResponseContext;
}): Promise<Response> {
  const suggestionOutput = await generateInboxAiSuggestion({
    apiKey: params.apiKey,
    systemInstruction: params.systemInstruction,
    contextPrompt: params.contextPrompt,
    grounding: params.grounding,
  });
  const {
    wompiCheckoutUrl,
    wompiPaymentReference,
    wompiAmountCOP,
  } = params.grounding;

  return jsonResponse({
    suggestion: suggestionOutput.suggestion,
    proposedActions: suggestionOutput.proposedActions,
    lastMessageIsOutbound: false,
    bookingContext: params.grounding.bookingContext,
    historyMeta: params.responseContext.historyMeta,
    conversationTags: params.responseContext.conversationTags,
    sessionWindow: params.responseContext.sessionWindow,
    ...(wompiCheckoutUrl ? { wompiCheckoutUrl } : {}),
    ...(wompiPaymentReference ? { wompiPaymentReference } : {}),
    ...(wompiAmountCOP ? { wompiAmountCOP } : {}),
  });
}

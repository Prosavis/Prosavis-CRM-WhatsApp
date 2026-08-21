import { jsonResponse } from './cors.ts';
import {
  generateInboxAiSuggestion,
  type InboxAiActionGrounding,
} from './inboxAiActions.ts';
import type { ConversationHistoryMeta } from './conversationHistory.ts';
import type { InboxAiPropertySummary } from './inboxAiContextFormat.ts';
import type { MetaSessionWindow } from './metaSessionWindow.ts';
import {
  DEFAULT_GEMINI_MODEL,
  resolveGeminiModel,
} from './geminiClient.ts';
import {
  buildSuggestionLogContextMeta,
  insertWhatsAppAiSuggestionLog,
} from './inboxAiSuggestionLog.ts';
import { rewriteSuggestionGreetingName } from './inboxAiNameGrounding.ts';

/** Cliente Supabase tipado de forma laxa. */
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface InboxAiResponseContext {
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  sessionWindow: MetaSessionWindow;
  propertySummary?: InboxAiPropertySummary | null;
}

export interface SuggestionLogWriteParams {
  supabase: SupabaseClient;
  stableKey: string;
  createdBy: string | null;
}

function suggestionResponseFields(context: InboxAiResponseContext) {
  return {
    historyMeta: context.historyMeta,
    conversationTags: context.conversationTags,
    sessionWindow: context.sessionWindow,
    propertySummary: context.propertySummary ?? null,
  };
}

export function createLastOutboundInboxAiSuggestionResponse(
  context: InboxAiResponseContext,
): Response {
  return jsonResponse({
    suggestion: null,
    proposedActions: [],
    lastMessageIsOutbound: true,
    hint: 'El último mensaje es saliente. Usa forceGenerate para redactar igualmente.',
    suggestionLogId: null,
    ...suggestionResponseFields(context),
  });
}

export async function createGeneratedInboxAiSuggestionResponse(params: {
  apiKey: string;
  systemInstruction: string;
  contextPrompt: string;
  grounding: InboxAiActionGrounding;
  responseContext: InboxAiResponseContext;
  greetingFirstName?: string | null;
  suggestionLog?: SuggestionLogWriteParams | null;
}): Promise<Response> {
  const suggestionOutput = await generateInboxAiSuggestion({
    apiKey: params.apiKey,
    systemInstruction: params.systemInstruction,
    contextPrompt: params.contextPrompt,
    grounding: params.grounding,
  });
  suggestionOutput.suggestion = rewriteSuggestionGreetingName(
    suggestionOutput.suggestion,
    params.greetingFirstName,
  );
  const {
    wompiCheckoutUrl,
    wompiPaymentReference,
    wompiAmountCOP,
  } = params.grounding;

  const model = resolveGeminiModel('GEMINI_MODEL_JSON', DEFAULT_GEMINI_MODEL);
  let suggestionLogId: string | null = null;

  if (params.suggestionLog && suggestionOutput.suggestion) {
    const contextMeta = buildSuggestionLogContextMeta({
      historyMeta: params.responseContext.historyMeta,
      conversationTags: params.responseContext.conversationTags,
      propertySummary: params.responseContext.propertySummary,
      sessionWindow: params.responseContext.sessionWindow,
      proposedActionTypes: suggestionOutput.proposedActions.map((a) => a.type),
    });
    suggestionLogId = await insertWhatsAppAiSuggestionLog(
      params.suggestionLog.supabase,
      {
        stableKey: params.suggestionLog.stableKey,
        suggestion: suggestionOutput.suggestion,
        model,
        contextMeta,
        createdBy: params.suggestionLog.createdBy,
      },
    );
  }

  return jsonResponse({
    suggestion: suggestionOutput.suggestion,
    proposedActions: suggestionOutput.proposedActions,
    lastMessageIsOutbound: false,
    bookingContext: params.grounding.bookingContext,
    suggestionLogId,
    ...suggestionResponseFields(params.responseContext),
    ...(wompiCheckoutUrl ? { wompiCheckoutUrl } : {}),
    ...(wompiPaymentReference ? { wompiPaymentReference } : {}),
    ...(wompiAmountCOP ? { wompiAmountCOP } : {}),
  });
}

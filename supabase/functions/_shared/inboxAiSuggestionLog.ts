/**
 * Telemetría de sugerencias Inbox AI (Fase 5C).
 *
 * edit_ratio = levenshtein(suggestion, sent_text) / max(len(suggestion), len(sent_text), 1)
 * - Textos idénticos → 0
 * - Totalmente distintos (misma longitud) → 1
 * - Un string vacío y otro no → 1
 * - Ambos vacíos → 0
 */
import type { ConversationHistoryMeta } from './conversationHistory.ts';
import type { InboxAiPropertySummary } from './inboxAiContextFormat.ts';
import type { MetaSessionWindow } from './metaSessionWindow.ts';

/** Cliente Supabase tipado de forma laxa para Vitest + Deno. */
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const SUGGESTION_LOG_TABLE = 'whatsapp_ai_suggestion_log';

export interface SuggestionLogContextMeta {
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  propertySummary: InboxAiPropertySummary | null;
  sessionWindow: MetaSessionWindow;
  proposedActionTypes: string[];
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * Distancia de Levenshtein normalizada por max(len).
 * Documentado en el encabezado del módulo.
 */
export function computeEditRatio(suggestion: string, sentText: string): number {
  const a = suggestion ?? '';
  const b = sentText ?? '';
  const denom = Math.max(a.length, b.length, 1);
  if (a.length === 0 && b.length === 0) return 0;
  return levenshteinDistance(a, b) / denom;
}

export function buildSuggestionLogContextMeta(params: {
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  propertySummary: InboxAiPropertySummary | null | undefined;
  sessionWindow: MetaSessionWindow;
  proposedActionTypes: string[];
}): SuggestionLogContextMeta {
  return {
    historyMeta: params.historyMeta,
    conversationTags: [...params.conversationTags],
    propertySummary: params.propertySummary ?? null,
    sessionWindow: params.sessionWindow,
    proposedActionTypes: [...params.proposedActionTypes],
  };
}

export async function insertWhatsAppAiSuggestionLog(
  supabase: SupabaseClient,
  params: {
    stableKey: string;
    suggestion: string;
    model: string | null;
    contextMeta: SuggestionLogContextMeta;
    createdBy: string | null;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from(SUGGESTION_LOG_TABLE)
      .insert({
        stable_key: params.stableKey,
        suggestion: params.suggestion,
        model: params.model,
        context_meta: params.contextMeta,
        created_by: params.createdBy,
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.warn(
        JSON.stringify({
          scope: 'whatsapp-ai-suggestion-log',
          event: 'insert-failed',
          error: error?.message ?? 'missing id',
        }),
      );
      return null;
    }
    return String(data.id);
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'whatsapp-ai-suggestion-log',
        event: 'insert-threw',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

export async function closeWhatsAppAiSuggestionLog(
  supabase: SupabaseClient,
  params: {
    suggestionLogId: string;
    suggestion: string;
    sentText: string;
    actionTaken?: string | null;
  },
): Promise<{ ok: boolean; editRatio: number }> {
  const editRatio = computeEditRatio(params.suggestion, params.sentText);
  try {
    const payload: Record<string, unknown> = {
      sent_text: params.sentText,
      edit_ratio: editRatio,
      closed_at: new Date().toISOString(),
    };
    if (params.actionTaken != null) {
      payload.action_taken = params.actionTaken;
    }

    const { error } = await supabase
      .from(SUGGESTION_LOG_TABLE)
      .update(payload)
      .eq('id', params.suggestionLogId)
      .is('closed_at', null);

    if (error) {
      console.warn(
        JSON.stringify({
          scope: 'whatsapp-ai-suggestion-log',
          event: 'close-failed',
          error: error.message,
        }),
      );
      return { ok: false, editRatio };
    }
    return { ok: true, editRatio };
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'whatsapp-ai-suggestion-log',
        event: 'close-threw',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, editRatio };
  }
}

/** Cierra un log abierto cargando el `suggestion` original desde la fila. */
export async function closeWhatsAppAiSuggestionLogById(
  supabase: SupabaseClient,
  params: {
    suggestionLogId: string;
    sentText: string;
    actionTaken?: string | null;
  },
): Promise<{ ok: boolean; editRatio: number }> {
  try {
    const { data, error } = await supabase
      .from(SUGGESTION_LOG_TABLE)
      .select('id, suggestion, closed_at')
      .eq('id', params.suggestionLogId)
      .is('closed_at', null)
      .maybeSingle();

    if (error || !data?.suggestion) {
      console.warn(
        JSON.stringify({
          scope: 'whatsapp-ai-suggestion-log',
          event: 'close-by-id-missing',
          error: error?.message ?? 'not found or already closed',
        }),
      );
      return { ok: false, editRatio: 0 };
    }

    return closeWhatsAppAiSuggestionLog(supabase, {
      suggestionLogId: params.suggestionLogId,
      suggestion: String(data.suggestion),
      sentText: params.sentText,
      actionTaken: params.actionTaken,
    });
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'whatsapp-ai-suggestion-log',
        event: 'close-by-id-threw',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, editRatio: 0 };
  }
}

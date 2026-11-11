import { getGeminiApiKey } from './geminiClient.ts';
import { createStageTimer } from './suggestTiming.ts';
import { createInboxSuggestion } from './inboxAiSuggestPipeline.ts';
import {
  latestVisibleMessageAnchor,
  writeSuggestionPrefetch,
} from './suggestionPrefetch.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Genera un borrador al llegar un inbound, solo si la conversación tiene operador asignado. */
export async function prefetchAssignedSuggestion(params: {
  supabase: SupabaseClient;
  stableKey: string;
}): Promise<void> {
  const { data, error } = await params.supabase
    .from('whatsapp_conversations')
    .select('assigned_to')
    .eq('stable_key', params.stableKey)
    .maybeSingle();
  if (error || !data?.assigned_to) return;

  const apiKey = getGeminiApiKey();
  if (!apiKey) return;

  const anchor = await latestVisibleMessageAnchor(params.supabase, params.stableKey);
  if (!anchor) return;

  const response = await createInboxSuggestion({
    supabase: params.supabase,
    apiKey,
    stableKey: params.stableKey,
    forceGenerate: false,
    includeVoiceTranscriptions: false,
    includeCachedImageAnalysis: true,
    extraContext: '',
    createdBy: null,
    stageTimer: createStageTimer(),
    allowPrefetchHit: false,
  });
  if (!response.ok) return;
  const payload = await response.json() as Record<string, unknown>;
  if (!payload.suggestion) return;
  await writeSuggestionPrefetch(params.supabase, {
    stableKey: params.stableKey,
    anchorMessageId: anchor.id,
    payload,
  });
}

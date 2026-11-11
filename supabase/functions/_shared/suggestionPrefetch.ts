const PREFETCH_TABLE = 'whatsapp_ai_suggestion_prefetch';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface SuggestionAnchor {
  id: string;
  createdAt: string;
}

export async function latestVisibleMessageAnchor(
  supabase: SupabaseClient,
  stableKey: string,
): Promise<SuggestionAnchor | null> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_message_log')
      .select('id, created_at')
      .eq('conversation_stable_key', stableKey)
      .eq('hidden_from_panel', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.id || !data.created_at) return null;
    return { id: String(data.id), createdAt: String(data.created_at) };
  } catch {
    return null;
  }
}

export async function readSuggestionPrefetch(
  supabase: SupabaseClient,
  stableKey: string,
  anchorMessageId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from(PREFETCH_TABLE)
      .select('payload')
      .eq('stable_key', stableKey)
      .eq('anchor_message_id', anchorMessageId)
      .maybeSingle();
    if (error || !data?.payload || typeof data.payload !== 'object') return null;
    return data.payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function writeSuggestionPrefetch(
  supabase: SupabaseClient,
  params: {
    stableKey: string;
    anchorMessageId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from(PREFETCH_TABLE).upsert({
    stable_key: params.stableKey,
    anchor_message_id: params.anchorMessageId,
    payload: params.payload,
    created_at: new Date().toISOString(),
  }, { onConflict: 'stable_key,anchor_message_id' });
  if (error) {
    console.warn(JSON.stringify({
      scope: 'suggest-prefetch',
      event: 'upsert-failed',
      error: error.message,
    }));
  }
}

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ConversationTurn {
  role: 'user' | 'bot';
  text: string;
}

export async function getConversationHistory(
  supabase: SupabaseClient,
  stableKey: string,
  limit = 40,
  options?: { includeVoiceTranscriptions?: boolean },
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select('direction,message_body,caption,media_type,voice_transcription,hidden_from_panel')
    .eq('conversation_stable_key', stableKey)
    .eq('hidden_from_panel', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const turns: ConversationTurn[] = [];
  for (const row of data ?? []) {
    let text = (row.message_body || row.caption || '').trim();
    if (
      !text &&
      row.media_type === 'audio' &&
      options?.includeVoiceTranscriptions &&
      row.voice_transcription
    ) {
      text = String(row.voice_transcription).trim();
    }
    if (!text && row.media_type) text = `[${row.media_type}]`;
    if (!text) continue;
    turns.push({
      role: row.direction === 'inbound' ? 'user' : 'bot',
      text,
    });
  }
  return turns;
}

export function buildMergedTurns(turns: ConversationTurn[]): ConversationTurn[] {
  const firstUserIdx = turns.findIndex((t) => t.role === 'user' && t.text.trim());
  if (firstUserIdx === -1) return [];
  const sliced = turns.slice(firstUserIdx).filter((t) => t.text.trim());
  const merged: ConversationTurn[] = [];
  for (const t of sliced) {
    const text = t.text.trim();
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.text = `${last.text}\n${text}`;
    else merged.push({ role: t.role, text });
  }
  return merged;
}

export function mergedTurnsToTranscript(merged: ConversationTurn[]): string {
  return merged
    .map((t) => `${t.role === 'user' ? 'Cliente' : 'Agente'}: ${t.text}`)
    .join('\n');
}

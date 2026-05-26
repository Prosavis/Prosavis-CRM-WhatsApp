import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function recomputeWhatsAppConversationPreview(
  supabase: SupabaseClient,
  stableKey: string,
): Promise<void> {
  const { data: messages, error } = await supabase
    .from('whatsapp_message_log')
    .select('message_body,created_at,direction,status,media_type,caption')
    .eq('conversation_stable_key', stableKey)
    .eq('hidden_from_panel', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  const latest = messages?.[0];
  if (!latest) {
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_text: null,
        last_message_at: null,
        last_message_direction: null,
        last_message_outbound_status: null,
      })
      .eq('stable_key', stableKey);
    return;
  }

  const preview =
    latest.message_body ||
    latest.caption ||
    (latest.media_type ? `[${latest.media_type}]` : '');

  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_text: preview,
      last_message_at: latest.created_at,
      last_message_direction: latest.direction,
      last_message_outbound_status:
        latest.direction === 'outbound' ? latest.status : null,
    })
    .eq('stable_key', stableKey);
}

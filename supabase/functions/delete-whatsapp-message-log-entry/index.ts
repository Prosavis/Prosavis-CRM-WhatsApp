import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { recomputeWhatsAppConversationPreview } from '../_shared/recomputeConversationPreview.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';

const MAX_BATCH_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const messageIds = body.messageIds as string[] | undefined;
    const conversationId = body.conversationId ? String(body.conversationId).trim() : undefined;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return jsonResponse({ error: 'Se requiere messageIds (array no vacío).' }, 400);
    }
    if (messageIds.length > MAX_BATCH_SIZE) {
      return jsonResponse({ error: `Máximo ${MAX_BATCH_SIZE} mensajes por operación.` }, 400);
    }

    const stableKeys = new Set<string>();
    let count = 0;

    for (const messageId of messageIds) {
      const { data: row, error: readError } = await supabase
        .from('whatsapp_message_log')
        .select('id,conversation_stable_key,recipient_phone')
        .eq('id', messageId)
        .maybeSingle();
      if (readError) throw readError;
      if (!row) continue;

      if (row.conversation_stable_key) stableKeys.add(row.conversation_stable_key);
      if (row.recipient_phone) stableKeys.add(normalizePhone(row.recipient_phone));

      const { error: updateError } = await supabase
        .from('whatsapp_message_log')
        .update({
          hidden_from_panel: true,
          crm_deleted_at: new Date().toISOString(),
          crm_deleted_by: user.id,
          revoked_reason: 'crm',
        })
        .eq('id', messageId);

      if (updateError) throw updateError;
      count += 1;
    }

    if (conversationId) stableKeys.add(conversationId);
    await Promise.all(
      [...stableKeys].map((key) =>
        recomputeWhatsAppConversationPreview(supabase, key).catch((err) => {
          console.error('recomputeWhatsAppConversationPreview', key, err);
        })
      ),
    );

    return jsonResponse({ success: true, deleted: count });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

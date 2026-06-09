import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  blockOnMeta,
  formatError,
  getGraphCredentials,
  stickerStorageObjectPath,
} from '../_shared/whatsappOutbound.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';

export const DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE = 'ELIMINAR_CONVERSACION_WHATSAPP';
const LOG_BATCH = 200;

function collectStableKeys(conversationId: string, conversation: Record<string, unknown> | null): string[] {
  const keys = new Set<string>([conversationId.trim()]);
  if (!conversation) return [...keys];
  if (typeof conversation.phone === 'string' && conversation.phone.trim()) {
    keys.add(normalizePhone(conversation.phone));
  }
  if (typeof conversation.contact_phone === 'string' && conversation.contact_phone.trim()) {
    keys.add(normalizePhone(conversation.contact_phone));
  }
  if (typeof conversation.bsuid === 'string' && conversation.bsuid.trim()) {
    keys.add(conversation.bsuid.trim());
  }
  return [...keys];
}

async function deleteStoragePath(
  supabase: Awaited<ReturnType<typeof requireCrmAdmin>>['supabase'],
  bucket: string,
  storagePath: string,
): Promise<boolean> {
  const objectPath = bucket === 'whatsapp-stickers'
    ? stickerStorageObjectPath(storagePath)
    : storagePath;
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const conversationId = String(body.conversationId ?? '').trim();
    const confirmation = String(body.confirmation ?? '').trim();
    const blockUser = body.blockUser === true;
    const deleteLeads = body.deleteLeads !== false;
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;

    if (!conversationId) return jsonResponse({ error: 'conversationId requerido.' }, 400);
    if (confirmation !== DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE) {
      return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
    }

    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('stable_key', conversationId)
      .maybeSingle();
    if (convError) throw convError;

    const stableKeys = collectStableKeys(conversationId, conversation);
    let messagesDeleted = 0;
    let storageFilesDeleted = 0;
    let entriesDeactivated = 0;

    for (const key of stableKeys) {
      const { data: messages, error: msgError } = await supabase
        .from('whatsapp_message_log')
        .select('id,storage_path,media_url,storage_url')
        .eq('conversation_stable_key', key)
        .limit(LOG_BATCH);
      if (msgError) throw msgError;

      for (const message of messages ?? []) {
        if (message.storage_path) {
          const deleted = await deleteStoragePath(supabase, 'whatsapp-media', String(message.storage_path));
          if (deleted) storageFilesDeleted += 1;
        }
      }

      const ids = (messages ?? []).map((m) => m.id);
      if (ids.length) {
        const { error: deleteError } = await supabase.from('whatsapp_message_log').delete().in('id', ids);
        if (deleteError) throw deleteError;
        messagesDeleted += ids.length;
      }
    }

    if (deleteLeads) {
      const phones = stableKeys.filter((key) => /^[0-9]+$/.test(key));
      if (phones.length) {
        const { count, error: leadError } = await supabase
          .from('crm_directory')
          .update({
            status: 'inactive',
            whatsapp_conversation_id: null,
            updated_at: new Date().toISOString(),
          })
          .in('phone', phones);
        if (leadError) throw leadError;
        entriesDeactivated = count ?? 0;
      }
    }

    let metaBlockAttempted = false;
    let metaBlockSuccess = false;
    let metaErrorCode: string | undefined;

    if (blockUser) {
      const phones = stableKeys.filter((key) => /^[0-9]+$/.test(key));
      for (const key of stableKeys) {
        await supabase.from('whatsapp_blocklist').upsert(
          {
            phone: /^[0-9]+$/.test(key) ? key : key,
            stable_key: key,
            reason: 'admin_delete_conversation',
            created_by: user.id,
          },
          { onConflict: 'phone' },
        );
      }
      try {
        const graph = getGraphCredentials(phoneNumberId);
        const meta = await blockOnMeta(graph.phoneNumberId, graph.accessToken, phones);
        metaBlockAttempted = meta.attempted;
        metaBlockSuccess = meta.success;
        metaErrorCode = meta.errorCode;
      } catch {
        metaBlockAttempted = phones.length > 0;
        metaBlockSuccess = false;
        metaErrorCode = 'credentials_missing';
      }
    }

    const { error: deleteConvError } = await supabase
      .from('whatsapp_conversations')
      .delete()
      .eq('stable_key', conversationId);
    if (deleteConvError) throw deleteConvError;

    const conversationIds = stableKeys.filter(Boolean);
    if (conversationIds.length) {
      await supabase
        .from('crm_directory')
        .update({
          whatsapp_conversation_id: null,
          updated_at: new Date().toISOString(),
        })
        .in('whatsapp_conversation_id', conversationIds);
    }

    return jsonResponse({
      success: true,
      messagesDeleted,
      storageFilesDeleted,
      conversationRemoved: true,
      leadsDeleted: entriesDeactivated,
      metaBlockAttempted,
      metaBlockSuccess,
      ...(metaErrorCode ? { metaErrorCode } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

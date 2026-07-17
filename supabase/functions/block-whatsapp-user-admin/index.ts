import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { blockOnMeta, formatError, getGraphCredentials } from '../_shared/whatsappOutbound.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';
import { applyBlockedTagToDirectory } from '../_shared/directoryBlocklistSync.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId ?? '').trim();
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;

    if (!conversationId) return jsonResponse({ error: 'conversationId requerido.' }, 400);

    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('stable_key', conversationId)
      .maybeSingle();

    if (convError) throw convError;

    const keys = new Set<string>([conversationId]);
    if (conversation?.phone) keys.add(normalizePhone(conversation.phone));
    if (conversation?.contact_phone) keys.add(normalizePhone(conversation.contact_phone));
    if (conversation?.bsuid) keys.add(conversation.bsuid);

    let blocklistEntries = 0;
    for (const key of keys) {
      const isPhone = /^[0-9]+$/.test(key);
      const { error } = await supabase.from('whatsapp_blocklist').upsert(
        {
          phone: isPhone ? key : key,
          stable_key: key,
          bsuid: isPhone ? null : key,
          reason: 'admin_block',
          created_by: user.id,
        },
        { onConflict: 'phone' },
      );
      if (!error) blocklistEntries += 1;
    }

    // Inbox → directorio: tag Bloqueado (+ nota si no hay motivo previo).
    let directoryTagged = 0;
    try {
      directoryTagged = await applyBlockedTagToDirectory(
        supabase,
        keys,
        'Bloqueado desde inbox WhatsApp',
      );
    } catch (tagErr) {
      console.error('[block-whatsapp-user-admin] directory tag sync failed', tagErr);
    }

    const phones = [...keys].filter((key) => /^[0-9]+$/.test(key));
    let metaBlockAttempted = false;
    let metaBlockSuccess = false;
    let metaErrorCode: string | undefined;

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

    return jsonResponse({
      success: true,
      blocklistEntries,
      directoryTagged,
      metaBlockAttempted,
      metaBlockSuccess,
      ...(metaErrorCode ? { metaErrorCode } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

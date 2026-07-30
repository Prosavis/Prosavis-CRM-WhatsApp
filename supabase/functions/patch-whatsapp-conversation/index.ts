import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

function toDbPatch(patch: Record<string, unknown>) {
  const dbPatch: Record<string, unknown> = {};

  if ('adminNotes' in patch) dbPatch.admin_notes = patch.adminNotes;
  if ('contactName' in patch) dbPatch.contact_name = patch.contactName;
  if ('contactPhotoUrl' in patch) dbPatch.contact_photo_url = patch.contactPhotoUrl;
  if ('whatsappProfileName' in patch) dbPatch.whatsapp_profile_name = patch.whatsappProfileName;
  if ('contactNameLocked' in patch) dbPatch.contact_name_locked = patch.contactNameLocked;
  if ('crmForceUnread' in patch) dbPatch.crm_force_unread = patch.crmForceUnread;
  if ('tagIds' in patch) dbPatch.tag_ids = patch.tagIds;
  if ('isPinned' in patch) {
    dbPatch.is_pinned = patch.isPinned;
    dbPatch.pinned_at = patch.isPinned ? new Date().toISOString() : null;
  }
  if ('isArchived' in patch) {
    dbPatch.is_archived = patch.isArchived;
    dbPatch.archived_at = patch.isArchived ? new Date().toISOString() : null;
  }
  if ('automatedInboundDisabled' in patch) {
    dbPatch.automated_inbound_disabled = patch.automatedInboundDisabled;
  }

  return dbPatch;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveStableKey(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rawKey: string,
): Promise<string | null> {
  const key = rawKey.trim();
  if (!key) return null;

  const { data: byStable } = await supabase
    .from('whatsapp_conversations')
    .select('stable_key')
    .eq('stable_key', key)
    .maybeSingle();
  if (byStable?.stable_key) return String(byStable.stable_key);

  if (UUID_RE.test(key)) {
    const { data: byId } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key')
      .eq('id', key)
      .maybeSingle();
    if (byId?.stable_key) return String(byId.stable_key);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json();
    const rawKey = String(body.stableKey ?? body.conversationId ?? '').trim();
    const patch = toDbPatch(body.patch ?? {});

    if (!rawKey) return jsonResponse({ error: 'stableKey es requerido.' }, 400);
    if (!Object.keys(patch).length) return jsonResponse({ success: true });

    const stableKey = await resolveStableKey(supabase, rawKey);
    if (!stableKey) {
      return jsonResponse(
        { error: `Conversación no encontrada para key: ${rawKey}` },
        404,
      );
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update(patch)
      .eq('stable_key', stableKey)
      .select('stable_key')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return jsonResponse(
        { error: `No se actualizó ninguna fila para stable_key: ${stableKey}` },
        404,
      );
    }
    return jsonResponse({ success: true, stableKey });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

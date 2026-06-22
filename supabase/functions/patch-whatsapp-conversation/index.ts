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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json();
    const stableKey = String(body.stableKey ?? body.conversationId ?? '').trim();
    const patch = toDbPatch(body.patch ?? {});

    if (!stableKey) return jsonResponse({ error: 'stableKey es requerido.' }, 400);
    if (!Object.keys(patch).length) return jsonResponse({ success: true });

    const { error } = await supabase
      .from('whatsapp_conversations')
      .update(patch)
      .eq('stable_key', stableKey);

    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

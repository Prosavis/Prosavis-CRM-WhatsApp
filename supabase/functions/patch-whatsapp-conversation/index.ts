import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

function toDbPatch(patch: Record<string, unknown>) {
  const dbPatch: Record<string, unknown> = {};

  if ('adminNotes' in patch) dbPatch.admin_notes = patch.adminNotes;
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
    const stableKey = String(body.stableKey ?? '').trim();
    const patch = toDbPatch(body.patch ?? {});

    if (!stableKey) return jsonResponse({ error: 'stableKey es requerido.' }, 400);
    if (!Object.keys(patch).length) return jsonResponse({ ok: true });

    const { error } = await supabase
      .from('whatsapp_conversations')
      .update(patch)
      .eq('stable_key', stableKey);

    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

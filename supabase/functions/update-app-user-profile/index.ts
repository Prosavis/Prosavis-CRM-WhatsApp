import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { updateFirestoreUser } from '../_shared/firebaseAdminRest.ts';

/**
 * Sobrescribe el perfil del usuario de la App en Firestore users/{uid} con datos
 * verificados manualmente desde la ficha del CRM. El trigger Firebase
 * onUserWriteSyncDirectory re-sincroniza el cambio a crm_directory.
 *
 * Solo accesible por administradores del CRM (Supabase admin_profiles).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireCrmAdmin(req);

    const body = await req.json();
    const uid = String(body.uid ?? '').trim();
    if (!uid) return jsonResponse({ error: 'uid es requerido.' }, 400);

    const fields: Record<string, string> = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      fields.name = body.name.trim();
    }
    if (typeof body.email === 'string' && body.email.trim()) {
      fields.email = body.email.trim().toLowerCase();
    }
    if (typeof body.photoUrl === 'string' && body.photoUrl.trim()) {
      fields.photoUrl = body.photoUrl.trim();
    }

    if (Object.keys(fields).length === 0) {
      return jsonResponse({ success: true, updated: false });
    }

    await updateFirestoreUser(uid, fields);
    return jsonResponse({ success: true, updated: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

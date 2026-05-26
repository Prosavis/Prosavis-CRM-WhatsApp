import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError, getGraphCredentials, WHATSAPP_API_VERSION } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const wabaId = String(body.wabaId ?? '').trim();
    if (!wabaId) return jsonResponse({ error: 'Se requiere wabaId.' }, 400);

    const { accessToken } = getGraphCredentials();
    const fields = encodeURIComponent('name,status,language,category,components');
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?fields=${fields}&limit=100`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await response.json();
    if (!response.ok) {
      return jsonResponse({ error: payload?.error?.message ?? 'Error consultando Graph API.' }, 502);
    }

    const templates = (Array.isArray(payload.data) ? payload.data : []).map((t: Record<string, unknown>) => ({
      name: String(t.name ?? ''),
      language: String(t.language ?? ''),
      status: String(t.status ?? ''),
      category: t.category ? String(t.category) : undefined,
      components: t.components ?? [],
    }));

    return jsonResponse({ templates, paging: payload.paging ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

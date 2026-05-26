import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

const WHATSAPP_API_VERSION = 'v21.0';
const API_TIMEOUT_MS = 15000;

const ALLOWED_PROFILE_FIELDS = new Set([
  'about',
  'address',
  'description',
  'email',
  'vertical',
  'websites',
]);

function getGraphCreds(phoneNumberIdOverride?: string) {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim();
  const defaultId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim();
  const phoneNumberId = (phoneNumberIdOverride || defaultId || '').trim();

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'Credenciales WhatsApp no configuradas (WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID).',
    );
  }

  return { accessToken, phoneNumberId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const phoneNumberIdOverride =
      typeof body.phoneNumberId === 'string' ? body.phoneNumberId.trim() : undefined;
    const profilePatch = body.profile;

    if (!profilePatch || typeof profilePatch !== 'object') {
      return jsonResponse({ error: 'Se requiere un objeto profile.' }, 400);
    }

    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(profilePatch as Record<string, unknown>)) {
      if (!ALLOWED_PROFILE_FIELDS.has(key)) continue;
      if (value === undefined) continue;
      clean[key] = value;
    }

    if (Object.keys(clean).length === 0) {
      return jsonResponse({ error: 'No hay campos validos para actualizar.' }, 400);
    }

    if (typeof clean.about === 'string' && clean.about.length > 139) {
      return jsonResponse({ error: 'El campo "about" no puede exceder 139 caracteres.' }, 400);
    }

    if (typeof clean.description === 'string' && clean.description.length > 512) {
      return jsonResponse({ error: 'El campo "description" no puede exceder 512 caracteres.' }, 400);
    }

    if (Array.isArray(clean.websites) && clean.websites.length > 2) {
      return jsonResponse({ error: 'Se permiten maximo 2 sitios web.' }, 400);
    }

    const { accessToken, phoneNumberId } = getGraphCreds(phoneNumberIdOverride);
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/whatsapp_business_profile`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...clean,
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : 'Error al actualizar perfil WABA';
      return jsonResponse({ error: errorMsg }, 502);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

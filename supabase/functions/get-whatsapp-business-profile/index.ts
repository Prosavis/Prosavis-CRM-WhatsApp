import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

const WHATSAPP_API_VERSION = 'v21.0';
const API_TIMEOUT_MS = 15000;

function normalizeProfile(raw: Record<string, unknown> = {}) {
  const websites = raw.websites;
  return {
    about: typeof raw.about === 'string' ? raw.about : '',
    address: typeof raw.address === 'string' ? raw.address : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    vertical: typeof raw.vertical === 'string' ? raw.vertical : '',
    websites: Array.isArray(websites) ? websites.filter((w): w is string => typeof w === 'string') : [],
    profilePictureUrl:
      typeof raw.profile_picture_url === 'string'
        ? raw.profile_picture_url
        : typeof raw.profilePictureUrl === 'string'
          ? raw.profilePictureUrl
          : '',
  };
}

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

    const { accessToken, phoneNumberId } = getGraphCreds(phoneNumberIdOverride);
    const fields = 'about,address,description,email,profile_picture_url,websites,vertical';
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/whatsapp_business_profile?fields=${fields}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg =
        typeof data?.error?.message === 'string'
          ? data.error.message
          : 'Error al obtener perfil WABA';
      return jsonResponse({ error: errorMsg }, 502);
    }

    const profileData = (data?.data?.[0] ?? {}) as Record<string, unknown>;

    return jsonResponse({
      success: true,
      profile: normalizeProfile(profileData),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

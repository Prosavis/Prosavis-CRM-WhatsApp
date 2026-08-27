import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin, getServiceClient } from '../_shared/supabase.ts';
import { COMMERCIAL_PHONE_NUMBER_ID } from '../_shared/whatsappLines.ts';
import { getGraphCredentials, WHATSAPP_API_VERSION } from '../_shared/whatsappOutbound.ts';
import { evaluateCoexHealth } from '../_shared/whatsappCoexHealth.ts';

const FIELDS =
  'id,display_phone_number,verified_name,is_on_biz_app,platform_type,status,quality_rating,messaging_limit_tier';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireCrmAdmin(req);
    const credentials = getGraphCredentials(COMMERCIAL_PHONE_NUMBER_ID);
    const url =
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${credentials.phoneNumberId}` +
      `?fields=${encodeURIComponent(FIELDS)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(payload.error ?? payload.message ?? `Graph ${response.status}`));
    }

    const evaluation = evaluateCoexHealth({
      id: String(payload.id ?? credentials.phoneNumberId),
      display_phone_number: typeof payload.display_phone_number === 'string' ? payload.display_phone_number : undefined,
      verified_name: typeof payload.verified_name === 'string' ? payload.verified_name : undefined,
      is_on_biz_app: typeof payload.is_on_biz_app === 'boolean' ? payload.is_on_biz_app : null,
      platform_type: typeof payload.platform_type === 'string' ? payload.platform_type : null,
      quality_rating: typeof payload.quality_rating === 'string' ? payload.quality_rating : null,
      status: typeof payload.status === 'string' ? payload.status : null,
    });

    const row = {
      phone_number_id: credentials.phoneNumberId,
      display_phone_number: payload.display_phone_number ?? null,
      verified_name: payload.verified_name ?? null,
      is_on_biz_app: payload.is_on_biz_app ?? null,
      platform_type: payload.platform_type ?? null,
      quality_rating: payload.quality_rating ?? null,
      status: payload.status ?? null,
      healthy: evaluation.healthy,
      alert_active: evaluation.alertActive,
      last_checked_at: new Date().toISOString(),
      last_error: evaluation.alertActive ? evaluation.reason : null,
      raw: payload,
    };

    const supabase = getServiceClient();
    const { error } = await supabase.from('whatsapp_coex_health').upsert(row);
    if (error) throw error;

    return jsonResponse({
      success: true,
      ...evaluation,
      phoneNumberId: credentials.phoneNumberId,
      isOnBizApp: payload.is_on_biz_app === true,
      platformType: payload.platform_type ?? null,
      qualityRating: payload.quality_rating ?? null,
      lastCheckedAt: row.last_checked_at,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

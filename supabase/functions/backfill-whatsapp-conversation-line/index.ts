import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

/**
 * Repara conversaciones huérfanas sin phone_number_id (invisibles en el inbox
 * filtrado por línea WABA). Idempotente.
 *
 * Body: { phoneNumberId?: string, dryRun?: boolean }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = (await req.json().catch(() => ({}))) as {
      phoneNumberId?: string;
      dryRun?: boolean;
    };

    const phoneNumberId = String(
      body.phoneNumberId ?? Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    ).trim();

    if (!phoneNumberId) {
      return jsonResponse(
        { error: 'Falta phoneNumberId (body o WHATSAPP_PHONE_NUMBER_ID).' },
        400,
      );
    }

    const { count: orphanCount, error: countError } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key', { count: 'exact', head: true })
      .is('phone_number_id', null);

    if (countError) throw countError;

    const orphans = orphanCount ?? 0;
    if (body.dryRun || orphans === 0) {
      return jsonResponse({
        success: true,
        dryRun: Boolean(body.dryRun),
        phoneNumberId,
        orphanCount: orphans,
        updatedCount: 0,
      });
    }

    const { data, error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({ phone_number_id: phoneNumberId })
      .is('phone_number_id', null)
      .select('stable_key');

    if (updateError) throw updateError;

    return jsonResponse({
      success: true,
      dryRun: false,
      phoneNumberId,
      orphanCount: orphans,
      updatedCount: data?.length ?? 0,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  backfillUntranscribedPersistedAudio,
  transcribeInboundAudioById,
} from '../_shared/transcribeInboundAudio.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    if (body.backfill === true) {
      const limit = Number(body.limit);
      const result = await backfillUntranscribedPersistedAudio(supabase, {
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return jsonResponse({ success: true, ...result });
    }

    const messageLogId = String(body.messageLogId ?? '').trim();
    if (!messageLogId) return jsonResponse({ error: 'Se requiere messageLogId.' }, 400);

    const result = await transcribeInboundAudioById(supabase, messageLogId, { force });
    if (!result.ok) return jsonResponse({ error: result.error }, result.status);
    return jsonResponse({ success: true, transcript: result.transcript, cached: result.cached });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

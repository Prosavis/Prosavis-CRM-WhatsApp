import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { isInboxAiContextApiKeyValid } from '../_shared/inboxAiContextPack.ts';
import { resolveInboxAiOrGrokClient } from '../_shared/inboxAiContextAuth.ts';
import { canTranscribePersistedAudio } from '../_shared/inboxAiMediaLimits.ts';
import { getServiceClient, requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  backfillUntranscribedPersistedAudio,
  transcribeInboundAudioById,
} from '../_shared/transcribeInboundAudio.ts';

function bearerToken(req: Request): string {
  return (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

function isServiceRoleRequest(req: Request): boolean {
  const token = bearerToken(req);
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return Boolean(token && serviceRoleKey && token === serviceRoleKey);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    if (body.backfill === true) {
      const grokKey = req.headers.get('x-api-key')?.trim() ?? '';
      const expectedGrok = Deno.env.get('GROK_INBOX_AI_CONTEXT_KEY')?.trim() ?? '';
      const grokOk = isInboxAiContextApiKeyValid(grokKey, expectedGrok);
      if (!isServiceRoleRequest(req) && !grokOk) {
        await requireCrmAdmin(req);
      }
      const supabase = getServiceClient();
      const limit = Number(body.limit);
      const result = await backfillUntranscribedPersistedAudio(supabase, {
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return jsonResponse({ success: true, ...result });
    }

    const auth = await resolveInboxAiOrGrokClient(req);
    if ('error' in auth && auth.error) return auth.error;

    const messageLogId = String(body.messageLogId ?? '').trim();
    if (messageLogId) {
      const result = await transcribeInboundAudioById(auth.supabase, messageLogId, { force });
      if (!result.ok) return jsonResponse({ error: result.error }, result.status);
      return jsonResponse({ success: true, transcript: result.transcript, cached: result.cached });
    }

    const stableKey = String(body.stableKey ?? body.phone ?? '').trim();
    if (!stableKey) return jsonResponse({ error: 'Se requiere messageLogId, stableKey o phone.' }, 400);
    const ultimos = Math.min(8, Math.max(1, Number(body.ultimos) || 8));
    const { data, error } = await auth.supabase
      .from('whatsapp_message_log')
      .select('id, media_type, mime_type, filename, media_id, storage_path, voice_transcription, voice_transcription_status')
      .eq('conversation_stable_key', stableKey)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return jsonResponse({ error: formatError(error) }, 500);
    const candidates = (data ?? [])
      .filter((row: { media_type?: unknown; media_id?: unknown; storage_path?: unknown; mime_type?: unknown; filename?: unknown; voice_transcription?: unknown }) =>
        canTranscribePersistedAudio(row) && (force || !String(row.voice_transcription ?? '').trim())
      )
      .slice(0, ultimos);
    const items = [];
    for (const row of candidates) {
      const result = await transcribeInboundAudioById(auth.supabase, String(row.id), { force });
      items.push(result.ok
        ? { messageLogId: row.id, status: 'completed', transcript: result.transcript, cached: result.cached }
        : { messageLogId: row.id, status: 'failed', error: result.error });
    }
    return jsonResponse({ success: true, items });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

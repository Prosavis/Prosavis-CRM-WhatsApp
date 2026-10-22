import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import {
  isCtwaVoiceNudgeKind,
  processDueVoiceNudges,
  sendVoiceNudgeOne,
  sendVoiceNudgeSamples,
} from '../_shared/ctwaVoiceNudge.ts';

function isWorkerAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (service && auth === `Bearer ${service}`) return true;
  const secret = Deno.env.get('CTWA_VOICE_NUDGE_SECRET') ?? '';
  const header = req.headers.get('x-ctwa-voice-nudge') ?? '';
  return Boolean(secret && header && header === secret);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!isWorkerAuthorized(req)) {
      return jsonResponse({ error: 'Worker no autorizado' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'process');
    const supabase = getServiceClient();

    if (action === 'send-test') {
      const to = String(body.to ?? '').trim();
      const result = await sendVoiceNudgeSamples(supabase, to);
      if (!result.ok) return jsonResponse(result, 409);
      return jsonResponse(result);
    }

    if (action === 'send-one') {
      const to = String(body.to ?? '').trim();
      const kind = String(body.kind ?? '').trim();
      if (!isCtwaVoiceNudgeKind(kind)) {
        return jsonResponse({ ok: false, error: 'kind inválido' }, 400);
      }
      const result = await sendVoiceNudgeOne(supabase, to, kind, {
        ignoreTeam: body.ignoreTeam === true,
      });
      if (!result.ok) return jsonResponse(result, 409);
      return jsonResponse(result);
    }

    if (action !== 'process') {
      return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
    }

    const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 20);
    const result = await processDueVoiceNudges(supabase, limit);
    return jsonResponse(result);
  } catch (error) {
    console.error('ctwa-voice-nudge error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

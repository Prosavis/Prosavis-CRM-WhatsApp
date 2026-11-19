// Barrido de Sofía. Cada minuto toma los chats del 312 con un entrante en silencio
// de entre 60 y 90 segundos y les deja un borrador pendiente. No envía nada:
// el borrador espera a que una persona lo apruebe.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { createInboxSuggestion } from '../_shared/inboxAiSuggestPipeline.ts';
import { createStageTimer } from '../_shared/suggestTiming.ts';
import { bridgeGreeting, teamIsInOffice } from '../_shared/sofiaTeamHours.ts';
import { BOT_PHONE_NUMBER_ID } from '../_shared/whatsappLines.ts';
import {
  getGraphCredentials,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';

const SILENCE_FLOOR_SECONDS = 60;
const SILENCE_CEILING_SECONDS = 90;
const AGENT_VERSION = 'v1';

function isWorkerAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (service && auth === `Bearer ${service}`) return true;
  const secret = Deno.env.get('SOFIA_DRAFT_SWEEP_SECRET') ?? '';
  const header = req.headers.get('x-sofia-draft-sweep') ?? '';
  return Boolean(secret && header && header === secret);
}

interface Candidate {
  stable_key: string;
  anchor_message_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isWorkerAuthorized(req)) return jsonResponse({ error: 'Worker no autorizado' }, 401);

  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!apiKey) return jsonResponse({ error: 'Falta GEMINI_API_KEY' }, 412);

  const supabase = getServiceClient();
  const { data: settings } = await supabase
    .from('sofia_settings')
    .select('mode')
    .eq('id', 1)
    .maybeSingle();
  if (settings?.mode !== 'supervisada') {
    return jsonResponse({ drafted: 0, reason: 'modo apagado' });
  }

  const { data: candidates, error } = await supabase
    .schema('app_private')
    .rpc('sofia_draft_candidates', {
      silence_floor: SILENCE_FLOOR_SECONDS,
      silence_ceiling: SILENCE_CEILING_SECONDS,
    });
  if (error) return jsonResponse({ error: error.message }, 500);

  const inOffice = teamIsInOffice(new Date());
  let drafted = 0;
  let bridged = 0;
  for (const candidate of (candidates ?? []) as Candidate[]) {
    if (!inOffice) bridged += await sendBridge(supabase, candidate.stable_key) ? 1 : 0;
    const response = await createInboxSuggestion({
      supabase,
      apiKey,
      stableKey: candidate.stable_key,
      forceGenerate: false,
      includeVoiceTranscriptions: true,
      includeCachedImageAnalysis: true,
      extraContext: '',
      createdBy: null,
      stageTimer: createStageTimer(),
      allowPrefetchHit: false,
    });
    const body = await response.json().catch(() => null) as { suggestion?: string; suggestionLogId?: string } | null;
    const suggestion = body?.suggestion?.trim();
    if (!suggestion) continue;
    const { error: writeError } = await supabase.from('sofia_pending_drafts').upsert({
      stable_key: candidate.stable_key,
      anchor_message_id: candidate.anchor_message_id,
      suggestion,
      suggestion_log_id: body?.suggestionLogId ?? null,
      agent_version: AGENT_VERSION,
      created_at: new Date().toISOString(),
    });
    if (!writeError) drafted += 1;
  }

  return jsonResponse({ drafted, bridged });
});

/** Un solo mensaje puente por conversación y por día fuera de horario. Devuelve true si lo envió. */
async function sendBridge(
  supabase: ReturnType<typeof getServiceClient>,
  stableKey: string,
): Promise<boolean> {
  const windowDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const { data: already } = await supabase
    .from('sofia_bridge_log')
    .select('stable_key')
    .eq('stable_key', stableKey)
    .eq('window_date', windowDate)
    .maybeSingle();
  if (already) return false;

  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('phone')
    .eq('stable_key', stableKey)
    .maybeSingle();
  const phone = conversation?.phone?.trim();
  if (!phone) return false;

  const graph = getGraphCredentials(BOT_PHONE_NUMBER_ID);
  const text = bridgeGreeting(new Date());
  const metaResult = await sendToMeta({
    to: phone,
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    messageBody: text,
  });
  await persistOutboundLog(supabase, {
    conversation_stable_key: stableKey,
    recipient_phone: phone,
    direction: 'outbound',
    sender_type: 'system',
    message_body: text,
    status: metaResult.status,
    wa_message_id: metaResult.waMessageId,
    campaign_type: 'OTHER',
    phone_number_id: graph.phoneNumberId,
    raw_payload: metaResult.payload,
  }, null, 'system');
  await updateConversationPreview(supabase, stableKey, text, metaResult.status, new Date().toISOString());
  await supabase.from('sofia_bridge_log').insert({ stable_key: stableKey, window_date: windowDate });
  return metaResult.status !== 'failed';
}

// Barrido de Sofía. Toma los chats del 312 con un entrante en silencio
// de entre 60 segundos y 10 minutos, deja un borrador y lo revisa.
// No envía el borrador: una persona lo aprueba. El veredicto no bloquea el envío.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { createInboxSuggestion } from '../_shared/inboxAiSuggestPipeline.ts';
import { createStageTimer } from '../_shared/suggestTiming.ts';
import { bridgeGreeting, teamIsInOffice } from '../_shared/sofiaTeamHours.ts';
import { BOT_PHONE_NUMBER_ID } from '../_shared/whatsappLines.ts';
import { buildInboxAiContext } from '../_shared/inboxAiContext.ts';
import { SOFIA_PROMPT_V1_RULES } from '../_shared/inboxAiContextFormat.ts';
import { recordLlmUsage } from '../_shared/llmUsage.ts';
import { reviewDraft } from '../_shared/sofiaReview.mjs';
import {
  FirebaseCrmBridgeHttpError,
  postCrmAppointmentAction,
} from '../_shared/firebaseHttp.ts';
import { loadDirectoryByPhone } from '../_shared/inboxAiKnowledge.ts';
import {
  AUTO_BATCH,
  AUTO_GOODBYE,
  AUTO_HANDOFF,
  AUTO_RIDER,
  AUTO_SILENCE_FLOOR_SECONDS,
  appointmentConfirmation,
  claimsBooked,
  classifyInbound,
  pickBooking,
  readAppointmentId,
  type CreatePayload,
} from '../_shared/sofiaAutomatic.ts';
import { notifySofiaEscalation } from '../_shared/sofiaStaffNotice.ts';
import {
  getGraphCredentials,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';

const SILENCE_FLOOR_SECONDS = 60;
const SILENCE_CEILING_SECONDS = 600;
const MAX_REGENERATIONS = 2;

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

interface DraftBody {
  suggestion?: string;
  suggestionLogId?: string;
  proposedActions?: unknown;
}

interface AutoCandidate {
  stable_key: string;
  anchor_message_id: string;
  nombre: string | null;
  inbound_text: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isWorkerAuthorized(req)) return jsonResponse({ error: 'Worker no autorizado' }, 401);

  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!apiKey) return jsonResponse({ error: 'Falta GEMINI_API_KEY' }, 412);

  const supabase = getServiceClient();
  const body = await req.json().catch(() => ({})) as { paso?: string; stable_key?: string; nota?: string };
  const { data: settings } = await supabase
    .from('sofia_settings')
    .select('mode, active_prompt_version')
    .eq('id', 1)
    .maybeSingle();
  const rules = await activeRules(supabase);
  const agentVersion = settings?.active_prompt_version ? `v${settings.active_prompt_version}` : 'v1';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (body.paso === 'regenerar') {
    const stableKey = body.stable_key?.trim() ?? '';
    if (!stableKey) return jsonResponse({ error: 'falta el chat' }, 400);
    const { data: existing } = await supabase
      .from('sofia_pending_drafts')
      .select('anchor_message_id')
      .eq('stable_key', stableKey)
      .maybeSingle();
    if (!existing?.anchor_message_id) return jsonResponse({ error: 'no hay borrador' }, 404);
    const saved = await draftWithReview({
      supabase,
      apiKey,
      anthropicKey,
      rules,
      agentVersion,
      stableKey,
      anchorMessageId: existing.anchor_message_id,
      note: typeof body.nota === 'string' ? body.nota.slice(0, 500) : '',
    });
    return jsonResponse({ regenerado: saved });
  }
  if (settings?.mode === 'sola') {
    const automaticRules = await proposalRules(supabase);
    if (!automaticRules) return jsonResponse({ sent: 0, reason: 'sin propuesta' });
    return jsonResponse(await runAutomatic({
      supabase,
      apiKey,
      anthropicKey,
      rules: automaticRules,
    }));
  }
  if (settings?.mode !== 'supervisada') {
    return jsonResponse({ drafted: 0, reason: 'modo apagado' });
  }

  const { data: candidates, error } = await supabase.rpc('sofia_draft_candidates', {
    silence_floor: SILENCE_FLOOR_SECONDS,
    silence_ceiling: SILENCE_CEILING_SECONDS,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  const inOffice = teamIsInOffice(new Date());
  let drafted = 0;
  let bridged = 0;
  for (const candidate of (candidates ?? []) as Candidate[]) {
    if (!(await stillSupervised(supabase))) break;
    if (!inOffice) bridged += await sendBridge(supabase, candidate.stable_key) ? 1 : 0;
    const saved = await draftWithReview({
      supabase,
      apiKey,
      anthropicKey,
      rules,
      agentVersion,
      stableKey: candidate.stable_key,
      anchorMessageId: candidate.anchor_message_id,
    });
    if (saved) drafted += 1;
  }

  return jsonResponse({ drafted, bridged });
});

async function activeRules(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  const { data, error } = await supabase
    .from('sofia_prompt_versions')
    .select('body')
    .eq('status', 'activa')
    .limit(1)
    .maybeSingle();
  if (error || typeof data?.body !== 'string' || !data.body.trim()) return SOFIA_PROMPT_V1_RULES;
  return data.body;
}

async function proposalRules(supabase: ReturnType<typeof getServiceClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('sofia_prompt_versions')
    .select('body')
    .eq('status', 'propuesta')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || typeof data?.body !== 'string' || !data.body.trim()) return null;
  return `${data.body.trim()}\n\n${AUTO_RIDER}`;
}

async function generate(
  supabase: ReturnType<typeof getServiceClient>,
  apiKey: string,
  stableKey: string,
  extraContext: string,
  rulesOverride?: string,
): Promise<DraftBody | null> {
  const response = await createInboxSuggestion({
    supabase,
    apiKey,
    stableKey,
    forceGenerate: extraContext.length > 0,
    includeVoiceTranscriptions: true,
    includeCachedImageAnalysis: true,
    extraContext,
    createdBy: null,
    stageTimer: createStageTimer(),
    allowPrefetchHit: false,
    rulesOverride,
  });
  return await response.json().catch(() => null) as DraftBody | null;
}

async function stillSupervised(supabase: ReturnType<typeof getServiceClient>): Promise<boolean> {
  const { data } = await supabase.from('sofia_settings').select('mode').eq('id', 1).maybeSingle();
  return data?.mode === 'supervisada';
}

async function draftWithReview(params: {
  supabase: ReturnType<typeof getServiceClient>;
  apiKey: string;
  anthropicKey: string;
  rules: string;
  agentVersion: string;
  stableKey: string;
  anchorMessageId: string;
  note?: string;
}): Promise<boolean> {
  let extra = params.note?.trim() ?? '';
  let suggestion = '';
  let suggestionLogId: string | null = null;
  for (let attempt = 1; attempt <= MAX_REGENERATIONS + 1; attempt += 1) {
    const body = await generate(params.supabase, params.apiKey, params.stableKey, extra);
    const next = body?.suggestion?.trim() ?? '';
    if (!next) break;
    suggestion = next;
    suggestionLogId = body?.suggestionLogId ?? null;
    if (!params.anthropicKey) break;
    const verdict = await judge(params, suggestion, attempt, suggestionLogId);
    if (verdict.verdict !== 'devolver' || attempt > MAX_REGENERATIONS) break;
    extra = `Nota de revisión: ${verdict.feedback}`;
  }
  if (!suggestion) return false;
  if (!(await stillSupervised(params.supabase))) return false;
  const { error } = await params.supabase.from('sofia_pending_drafts').upsert({
    stable_key: params.stableKey,
    anchor_message_id: params.anchorMessageId,
    suggestion,
    suggestion_log_id: suggestionLogId,
    agent_version: params.agentVersion,
    created_at: new Date().toISOString(),
  });
  return !error;
}

async function judge(
  params: {
    supabase: ReturnType<typeof getServiceClient>;
    anthropicKey: string;
    rules: string;
    stableKey: string;
  },
  suggestion: string,
  attempt: number,
  suggestionLogId: string | null,
): Promise<{ verdict: string; feedback: string }> {
  let context = '';
  try {
    const built = await buildInboxAiContext(params.supabase, params.stableKey, {
      includeVoiceTranscriptions: false,
      includeCachedImageAnalysis: false,
      memoryRefresh: 'background',
      promptLayout: 'compact',
    });
    context = built.formattedBlock;
  } catch {
    context = '';
  }
  try {
    const judged = await reviewDraft({
      anthropicKey: params.anthropicKey,
      rules: params.rules,
      context,
      draft: suggestion,
    });
    await recordLlmUsage(params.supabase, {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      purpose: 'reviewer',
      inputTokens: judged.inputTokens,
      outputTokens: judged.outputTokens,
    });
    await params.supabase.from('sofia_draft_reviews').insert({
      stable_key: params.stableKey,
      suggestion_log_id: suggestionLogId,
      attempt,
      verdict: judged.review.verdict,
      feedback: judged.review.feedback,
      missing_context: judged.review.missing,
    });
    return { verdict: judged.review.verdict, feedback: judged.review.feedback };
  } catch {
    await params.supabase.from('sofia_draft_reviews').insert({
      stable_key: params.stableKey,
      suggestion_log_id: suggestionLogId,
      attempt,
      verdict: 'riesgo',
      feedback: 'El revisor no respondió',
      missing_context: '',
    });
    return { verdict: 'riesgo', feedback: '' };
  }
}

async function modeIsSola(supabase: ReturnType<typeof getServiceClient>): Promise<boolean> {
  const { data } = await supabase.from('sofia_settings').select('mode').eq('id', 1).maybeSingle();
  return data?.mode === 'sola';
}

async function claimAuto(
  supabase: ReturnType<typeof getServiceClient>,
  candidate: AutoCandidate,
  action: 'enviado' | 'agendado' | 'elevado',
  reason: string,
): Promise<boolean> {
  const { error } = await supabase.from('sofia_auto_log').insert({
    anchor_message_id: candidate.anchor_message_id,
    stable_key: candidate.stable_key,
    action,
    reason,
  });
  if (error?.code === '23505') return false;
  return !error;
}

async function releaseAuto(
  supabase: ReturnType<typeof getServiceClient>,
  anchorMessageId: string,
): Promise<void> {
  await supabase.from('sofia_auto_log').delete().eq('anchor_message_id', anchorMessageId);
}

async function deliverAuto(
  supabase: ReturnType<typeof getServiceClient>,
  candidate: AutoCandidate,
  text: string,
  action: 'enviado' | 'agendado' | 'elevado',
  reason: string,
): Promise<boolean> {
  if (!(await modeIsSola(supabase))) return false;
  if (!(await claimAuto(supabase, candidate, action, reason))) return false;
  let sent = false;
  try {
    sent = await sendBotText(supabase, candidate.stable_key, text);
  } catch (error) {
    console.warn(JSON.stringify({
      scope: 'sofia-automatic',
      event: 'envio-fallo',
      error: error instanceof Error ? error.message : 'envio',
    }));
    sent = false;
  }
  if (!sent) {
    await releaseAuto(supabase, candidate.anchor_message_id);
    return false;
  }
  await supabase.from('sofia_pending_drafts').delete().eq('stable_key', candidate.stable_key);
  return true;
}

async function handoffAuto(
  supabase: ReturnType<typeof getServiceClient>,
  candidate: AutoCandidate,
  motivo: string,
): Promise<boolean> {
  const sent = await deliverAuto(supabase, candidate, AUTO_HANDOFF, 'elevado', motivo);
  if (!sent) return false;
  await notifySofiaEscalation(candidate.nombre ?? '', motivo);
  return true;
}

async function createHeldAppointment(
  supabase: ReturnType<typeof getServiceClient>,
  stableKey: string,
  anchorMessageId: string,
  payload: CreatePayload,
): Promise<'created' | 'retry' | 'rejected'> {
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('phone, phone_number_id')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (conversation?.phone_number_id && conversation.phone_number_id !== BOT_PHONE_NUMBER_ID) return 'rejected';
  const phone = conversation?.phone?.trim();
  if (!phone) return 'rejected';
  const directory = await loadDirectoryByPhone(supabase, phone);
  if (!directory?.id) return 'rejected';
  try {
    const result = await postCrmAppointmentAction({
      operationId: anchorMessageId,
      crmAdminId: 'sofia',
      type: 'create_appointment',
      directoryId: directory.id,
      scheduledDate: payload.scheduledDate,
      duration: payload.duration,
      wantsKit: payload.wantsKit,
    });
    return readAppointmentId(result).length > 0 ? 'created' : 'rejected';
  } catch (error) {
    if (error instanceof FirebaseCrmBridgeHttpError && error.status === 409) return 'created';
    if (error instanceof FirebaseCrmBridgeHttpError && error.status >= 400 && error.status < 500) return 'rejected';
    return 'retry';
  }
}

async function runAutomatic(params: {
  supabase: ReturnType<typeof getServiceClient>;
  apiKey: string;
  anthropicKey: string;
  rules: string;
}): Promise<{ sent: number; booked: number; escalated: number }> {
  const { data, error } = await params.supabase.rpc('sofia_auto_candidates', {
    silence_floor: AUTO_SILENCE_FLOOR_SECONDS,
    batch_size: AUTO_BATCH,
  });
  if (error) return { sent: 0, booked: 0, escalated: 0 };
  let sent = 0;
  let booked = 0;
  let escalated = 0;
  for (const candidate of (data ?? []) as AutoCandidate[]) {
    if (!(await modeIsSola(params.supabase))) break;
    try {
      const inbound = classifyInbound(candidate.inbound_text ?? '');
      if (inbound.kind === 'no') {
        if (await deliverAuto(params.supabase, candidate, AUTO_GOODBYE, 'enviado', inbound.motivo)) sent += 1;
        continue;
      }
      if (inbound.kind === 'escalar') {
        if (await handoffAuto(params.supabase, candidate, inbound.motivo)) escalated += 1;
        continue;
      }
      const outcome = await answerAutomatic(params, candidate);
      if (outcome === 'sent') sent += 1;
      if (outcome === 'booked') booked += 1;
      if (outcome === 'escalated') escalated += 1;
    } catch (error) {
      console.warn(JSON.stringify({
        scope: 'sofia-automatic',
        event: 'pasada-fallo',
        error: error instanceof Error ? error.message : 'pasada',
      }));
    }
  }
  return { sent, booked, escalated };
}

async function answerAutomatic(
  params: {
    supabase: ReturnType<typeof getServiceClient>;
    apiKey: string;
    anthropicKey: string;
    rules: string;
  },
  candidate: AutoCandidate,
): Promise<'sent' | 'booked' | 'escalated' | 'skip'> {
  if (!(await modeIsSola(params.supabase))) return 'skip';
  const body = await generate(
    params.supabase,
    params.apiKey,
    candidate.stable_key,
    AUTO_RIDER,
    params.rules,
  );
  if (!(await modeIsSola(params.supabase))) return 'skip';
  const booking = pickBooking(body?.proposedActions);
  if (booking.kind === 'mover') {
    return await handoffAuto(params.supabase, candidate, 'mover la cita') ? 'escalated' : 'skip';
  }
  if (booking.kind === 'crear') {
    if (!(await modeIsSola(params.supabase))) return 'skip';
    if (!(await claimAuto(params.supabase, candidate, 'agendado', 'cupo real'))) return 'skip';
    const created = await createHeldAppointment(
      params.supabase,
      candidate.stable_key,
      candidate.anchor_message_id,
      booking.payload,
    );
    const text = created === 'created'
      ? appointmentConfirmation(booking.payload.scheduledDate, booking.payload.duration)
      : null;
    if (created === 'retry' || !text) {
      await releaseAuto(params.supabase, candidate.anchor_message_id);
      if (created === 'retry') return 'skip';
      return await handoffAuto(params.supabase, candidate, 'no se creó la cita') ? 'escalated' : 'skip';
    }
    if (!(await modeIsSola(params.supabase))) return 'skip';
    let sent = false;
    try {
      sent = await sendBotText(params.supabase, candidate.stable_key, text);
    } catch (error) {
      console.warn(JSON.stringify({
        scope: 'sofia-automatic',
        event: 'envio-fallo',
        error: error instanceof Error ? error.message : 'envio',
      }));
      sent = false;
    }
    if (!sent) {
      await releaseAuto(params.supabase, candidate.anchor_message_id);
      return 'skip';
    }
    await params.supabase.from('sofia_pending_drafts').delete().eq('stable_key', candidate.stable_key);
    return 'booked';
  }
  const suggestion = body?.suggestion?.trim() ?? '';
  if (!suggestion || !params.anthropicKey) return 'skip';
  const verdict = await judge(
    { ...params, stableKey: candidate.stable_key },
    suggestion,
    1,
    body?.suggestionLogId ?? null,
  );
  if (verdict.feedback === 'El revisor no respondió' && !claimsBooked(suggestion)) return 'skip';
  if (verdict.verdict !== 'aprobar' || claimsBooked(suggestion)) {
    const motivo = claimsBooked(suggestion) ? 'dijo que agendó sin cita' : 'el revisor frenó el borrador';
    return await handoffAuto(params.supabase, candidate, motivo) ? 'escalated' : 'skip';
  }
  return await deliverAuto(params.supabase, candidate, suggestion, 'enviado', 'respuesta') ? 'sent' : 'skip';
}

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
  const text = bridgeGreeting(new Date());
  const sent = await sendBotText(supabase, stableKey, text);
  if (!sent) return false;
  await supabase.from('sofia_bridge_log').insert({ stable_key: stableKey, window_date: windowDate });
  return true;
}

/** Sale solo por la línea 312. */
async function sendBotText(
  supabase: ReturnType<typeof getServiceClient>,
  stableKey: string,
  text: string,
): Promise<boolean> {
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('phone, phone_number_id')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (conversation?.phone_number_id && conversation.phone_number_id !== BOT_PHONE_NUMBER_ID) return false;
  const phone = conversation?.phone?.trim();
  if (!phone) return false;

  const graph = getGraphCredentials(BOT_PHONE_NUMBER_ID);
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
  return metaResult.status !== 'failed';
}

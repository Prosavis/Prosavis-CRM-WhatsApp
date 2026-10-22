import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BOT_PHONE_NUMBER_ID } from './whatsappLines.ts';
import {
  getGraphCredentials,
  isRecipientBlocked,
  isUniqueViolation,
  outboundConversationKey,
  outboundCustomerPhone,
  outboundRecipientLogIdentity,
  persistOutboundLog,
  rejectIfSessionWindowClosed,
  sendToMeta,
  uploadMediaBinaryToMeta,
} from './whatsappOutbound.ts';

export const CTWA_VOICE_NUDGE_CAMPAIGN = 'CTWA_VOICE_NUDGE';
export const CTWA_VOICE_NUDGE_DELAY_MS = 5 * 60 * 1000;
export const CTWA_VOICE_NUDGE_MAX_ATTEMPTS = 2;
export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';

export type CtwaVoiceNudgeKind = 'menu' | 'hogar' | 'empresas';

export type CtwaVoiceNudgeSource = 'inicio' | 'hogar' | 'empresas' | 'empleo' | 'none';

/** Mismos textos que scripts/generate-ctwa-voice-nudges.mjs. */
export const CTWA_VOICE_NUDGE_SCRIPT: Record<CtwaVoiceNudgeKind, string> = {
  menu: 'Hola, buenas. Te habla Sofía, de Prosavis. Vi que nos escribiste y quiero ayudarte de una. Cuéntame qué necesitas: una limpieza para tu casa, para tu empresa, o si estás buscando empleo. Y regálame tu nombre, por favor, para guardarte y atenderte de forma más personalizada. Si quieres que te llamemos a otro número, también me lo dejas por aquí.',
  hogar: 'Hola, soy Sofía otra vez. Te acabo de dejar la información de la limpieza para tu casa. Si te sirve, regálame tu nombre, el municipio y el día que la necesitas, y te dejamos el cupo.',
  empresas: 'Hola, soy Sofía otra vez. Te dejé la información de limpieza para empresas. Cuéntame qué espacio es, en qué municipio queda, y tu nombre, y te armamos la cotización.',
};

export const CTWA_VOICE_NUDGE_STORAGE: Record<CtwaVoiceNudgeKind, string> = {
  menu: 'brand/ctwa-nudge-menu.ogg',
  hogar: 'brand/ctwa-nudge-hogar.ogg',
  empresas: 'brand/ctwa-nudge-empresas.ogg',
};

export type CtwaVoiceNudgeSkipReason =
  | 'inbound_after_anchor'
  | 'agent_after_anchor'
  | 'route_already_sent'
  | 'automated_disabled'
  | 'blocked'
  | 'session_closed'
  | 'not_bot_line'
  | 'missing_audio'
  | 'meta_failed'
  | 'too_late';

/** El cron es cada minuto. Pasados 10 minutos del vencimiento la nota ya no está caliente. */
export function voiceNudgeStillHot(dueAt: string, now: Date): boolean {
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return false;
  return now.getTime() - due <= 10 * 60 * 1000;
}

export interface CtwaVoiceNudgeRow {
  id: string;
  conversation_stable_key: string;
  phone_number_id: string;
  recipient: string;
  kind: CtwaVoiceNudgeKind;
  anchor_wa_message_id: string;
  anchor_at: string;
  due_at: string;
  status: string;
  attempts: number;
  skip_reason: string | null;
}

export function voiceNudgeKindForAction(action: CtwaVoiceNudgeSource): CtwaVoiceNudgeKind | null {
  switch (action) {
    case 'inicio':
      return 'menu';
    case 'hogar':
      return 'hogar';
    case 'empresas':
      return 'empresas';
    case 'empleo':
    case 'none':
      return null;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export function voiceNudgeDueAt(anchorAt: Date): Date {
  return new Date(anchorAt.getTime() + CTWA_VOICE_NUDGE_DELAY_MS);
}

export function decideVoiceNudgeSend(input: {
  kind: CtwaVoiceNudgeKind;
  phoneNumberId: string;
  automatedInboundDisabled: boolean;
  blocked: boolean;
  sessionClosed: boolean;
  inboundAfterAnchor: boolean;
  agentAfterAnchor: boolean;
  routeAfterAnchor: boolean;
}): { send: true } | { send: false; reason: CtwaVoiceNudgeSkipReason } {
  if (input.phoneNumberId !== BOT_PHONE_NUMBER_ID) {
    return { send: false, reason: 'not_bot_line' };
  }
  if (input.automatedInboundDisabled) return { send: false, reason: 'automated_disabled' };
  if (input.blocked) return { send: false, reason: 'blocked' };
  if (input.sessionClosed) return { send: false, reason: 'session_closed' };
  if (input.inboundAfterAnchor) return { send: false, reason: 'inbound_after_anchor' };
  if (input.agentAfterAnchor) return { send: false, reason: 'agent_after_anchor' };
  if (input.kind === 'menu' && input.routeAfterAnchor) {
    return { send: false, reason: 'route_already_sent' };
  }
  return { send: true };
}

export function isCtwaVoiceNudgeKind(value: string): value is CtwaVoiceNudgeKind {
  return value === 'menu' || value === 'hogar' || value === 'empresas';
}

const HEART_ONLY = new Set(['❤️', '❤', '♡', '♥️']);

/** Un corazón suelto no es una respuesta del equipo. Un texto sí. */
export function isTeamTextTakeover(body: string | null | undefined): boolean {
  const text = (body ?? '').trim();
  if (!text) return false;
  return !HEART_ONLY.has(text);
}

interface ActivityRow {
  direction: string | null;
  sender_type: string | null;
  sent_via: string | null;
  campaign_type: string | null;
}

export function activityBlocksVoiceNudge(rows: readonly ActivityRow[]): {
  inboundAfterAnchor: boolean;
  agentAfterAnchor: boolean;
  routeAfterAnchor: boolean;
} {
  let inboundAfterAnchor = false;
  let agentAfterAnchor = false;
  let routeAfterAnchor = false;
  for (const row of rows) {
    if (row.direction === 'inbound') inboundAfterAnchor = true;
    if (
      row.direction === 'outbound'
      && (row.sender_type === 'agent' || row.sent_via === 'crm')
    ) {
      agentAfterAnchor = true;
    }
    if (row.campaign_type === 'CTWA_ROUTE') routeAfterAnchor = true;
  }
  return { inboundAfterAnchor, agentAfterAnchor, routeAfterAnchor };
}

export async function cancelPendingVoiceNudges(
  supabase: SupabaseClient,
  stableKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('ctwa_voice_nudges')
    .update({
      status: 'cancelled',
      skip_reason: 'replaced',
      updated_at: new Date().toISOString(),
    })
    .eq('conversation_stable_key', stableKey)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
}

export async function scheduleVoiceNudgeAfterSend(params: {
  supabase: SupabaseClient;
  stableKey: string;
  to: string;
  phoneNumberId: string;
  action: CtwaVoiceNudgeSource;
  anchorWaMessageId: string;
  anchorAt: string;
}): Promise<void> {
  await cancelPendingVoiceNudges(params.supabase, params.stableKey);
  const kind = voiceNudgeKindForAction(params.action);
  if (!kind || !params.anchorWaMessageId) return;
  const anchorAt = new Date(params.anchorAt);
  const dueAt = Number.isNaN(anchorAt.getTime())
    ? voiceNudgeDueAt(new Date())
    : voiceNudgeDueAt(anchorAt);
  const { error } = await params.supabase.from('ctwa_voice_nudges').insert({
    conversation_stable_key: params.stableKey,
    phone_number_id: params.phoneNumberId,
    recipient: params.to,
    kind,
    anchor_wa_message_id: params.anchorWaMessageId,
    anchor_at: Number.isNaN(anchorAt.getTime()) ? new Date().toISOString() : anchorAt.toISOString(),
    due_at: dueAt.toISOString(),
    status: 'pending',
  });
  if (error && !isUniqueViolation(error)) throw new Error(error.message);
}

async function finishNudge(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('ctwa_voice_nudges')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'sending');
  if (error) console.error('ctwa voice nudge finish failed', error);
}

async function evaluateClaimedNudge(
  supabase: SupabaseClient,
  row: CtwaVoiceNudgeRow,
): Promise<{ send: true } | { send: false; reason: CtwaVoiceNudgeSkipReason }> {
  const { data: conv, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('automated_inbound_disabled')
    .eq('stable_key', row.conversation_stable_key)
    .maybeSingle();
  if (convError) throw new Error(convError.message);

  const { data: activity, error: activityError } = await supabase
    .from('whatsapp_message_log')
    .select('direction, sender_type, sent_via, campaign_type')
    .eq('conversation_stable_key', row.conversation_stable_key)
    .gt('created_at', row.anchor_at)
    .limit(100);
  if (activityError) throw new Error(activityError.message);

  const sessionBlock = await rejectIfSessionWindowClosed(supabase, row.conversation_stable_key);
  const blocked = await isRecipientBlocked(supabase, row.recipient);
  const flags = activityBlocksVoiceNudge(activity ?? []);
  return decideVoiceNudgeSend({
    kind: row.kind,
    phoneNumberId: row.phone_number_id,
    automatedInboundDisabled: conv?.automated_inbound_disabled === true,
    blocked,
    sessionClosed: sessionBlock != null,
    ...flags,
  });
}

async function sendVoiceNudgeAudio(
  supabase: SupabaseClient,
  params: {
    kind: CtwaVoiceNudgeKind;
    recipient: string;
    phoneNumberId: string;
    conversationStableKey: string;
    test: boolean;
    batch?: string;
  },
): Promise<{ ok: true; waMessageId: string } | { ok: false; reason: string }> {
  const storagePath = CTWA_VOICE_NUDGE_STORAGE[params.kind];
  const { data: blob, error } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .download(storagePath);
  if (error || !blob) return { ok: false, reason: 'missing_audio' };

  const graph = getGraphCredentials(params.phoneNumberId);
  const filename = `ctwa-nudge-${params.kind}.ogg`;
  const mediaId = await uploadMediaBinaryToMeta({
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    file: blob,
    mimeType: 'audio/ogg',
    filename,
  });
  const script = CTWA_VOICE_NUDGE_SCRIPT[params.kind];
  const metaResult = await sendToMeta({
    to: outboundCustomerPhone(params.recipient),
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    mediaId,
    mediaType: 'audio',
    voiceNote: true,
  });
  if (metaResult.status !== 'sent' || !metaResult.waMessageId) {
    return { ok: false, reason: metaResult.errorMessage ?? 'meta_failed' };
  }

  const stableKey = params.conversationStableKey
    || outboundConversationKey(params.recipient, graph.phoneNumberId);
  const identity = outboundRecipientLogIdentity(params.recipient);
  const persisted = await persistOutboundLog(supabase, {
    conversation_stable_key: stableKey,
    recipient_phone: identity.recipientPhone,
    recipient_bsuid: identity.recipientBsuid,
    direction: 'outbound',
    sender_type: 'system',
    message_body: '[Nota de voz]',
    media_type: 'audio',
    filename,
    storage_path: storagePath,
    mime_type: 'audio/ogg',
    size_bytes: blob.size,
    media_id: mediaId,
    is_voice_note: true,
    voice_transcription: script,
    voice_transcription_status: 'completed',
    voice_transcription_model: 'script',
    voice_transcription_at: new Date().toISOString(),
    status: metaResult.status,
    wa_message_id: metaResult.waMessageId,
    campaign_type: CTWA_VOICE_NUDGE_CAMPAIGN,
    phone_number_id: graph.phoneNumberId,
    error_message: null,
    raw_payload: {
      meta: metaResult.payload,
      nudge_kind: params.kind,
      ...(params.test ? { test: true } : {}),
      ...(params.batch ? { batch: params.batch } : {}),
    },
  }, null, 'system');

  const createdAt = persisted.createdAt ?? new Date().toISOString();
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_text: 'Nota de voz',
      last_message_at: createdAt,
      last_message_direction: 'outbound',
      last_message_outbound_status: metaResult.status,
    })
    .eq('stable_key', stableKey);

  return { ok: true, waMessageId: metaResult.waMessageId };
}

export async function deliverClaimedVoiceNudge(
  supabase: SupabaseClient,
  row: CtwaVoiceNudgeRow,
): Promise<{ id: string; status: string; reason?: string }> {
  try {
    if (!isCtwaVoiceNudgeKind(row.kind)) {
      await finishNudge(supabase, row.id, { status: 'skipped', skip_reason: 'not_bot_line' });
      return { id: row.id, status: 'skipped', reason: 'not_bot_line' };
    }
    if (!voiceNudgeStillHot(row.due_at, new Date())) {
      await finishNudge(supabase, row.id, { status: 'skipped', skip_reason: 'too_late' });
      return { id: row.id, status: 'skipped', reason: 'too_late' };
    }
    const decision = await evaluateClaimedNudge(supabase, row);
    if (!decision.send) {
      await finishNudge(supabase, row.id, { status: 'skipped', skip_reason: decision.reason });
      return { id: row.id, status: 'skipped', reason: decision.reason };
    }
    const sent = await sendVoiceNudgeAudio(supabase, {
      kind: row.kind,
      recipient: row.recipient,
      phoneNumberId: row.phone_number_id,
      conversationStableKey: row.conversation_stable_key,
      test: false,
    });
    if (!sent.ok) {
      const gaveUp = row.attempts >= CTWA_VOICE_NUDGE_MAX_ATTEMPTS;
      await finishNudge(supabase, row.id, gaveUp
        ? { status: 'failed', skip_reason: sent.reason }
        : { status: 'pending', due_at: new Date().toISOString(), skip_reason: sent.reason });
      return { id: row.id, status: gaveUp ? 'failed' : 'pending', reason: sent.reason };
    }
    await finishNudge(supabase, row.id, {
      status: 'sent',
      wa_message_id: sent.waMessageId,
      skip_reason: null,
    });
    return { id: row.id, status: 'sent' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const gaveUp = row.attempts >= CTWA_VOICE_NUDGE_MAX_ATTEMPTS;
    await finishNudge(supabase, row.id, gaveUp
      ? { status: 'failed', skip_reason: reason.slice(0, 300) }
      : { status: 'pending', due_at: new Date().toISOString(), skip_reason: reason.slice(0, 300) });
    console.error('ctwa voice nudge delivery failed', error);
    return { id: row.id, status: gaveUp ? 'failed' : 'pending', reason };
  }
}

export async function processDueVoiceNudges(
  supabase: SupabaseClient,
  limit = 10,
): Promise<{ live: boolean; results: Array<{ id: string; status: string; reason?: string }> }> {
  const { data: settings, error: settingsError } = await supabase
    .from('ctwa_voice_nudge_settings')
    .select('live')
    .eq('id', 1)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  if (settings?.live !== true) return { live: false, results: [] };

  const { data, error } = await supabase.rpc('claim_ctwa_voice_nudges', {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const rows = (Array.isArray(data) ? data : []) as CtwaVoiceNudgeRow[];
  const results = [];
  for (const row of rows) {
    results.push(await deliverClaimedVoiceNudge(supabase, row));
  }
  return { live: true, results };
}

function stageFromOutbound(campaign: string, body: string): string | null {
  if (campaign === 'CTWA_MENU') return 'menu';
  if (campaign !== 'CTWA_ROUTE') return null;
  const text = body.toLowerCase();
  if (text.includes('limpieza de hogar') || text.includes('4 horas')) return 'hogar';
  if (text.includes('hacer parte')) return 'empleo';
  if (text.includes('empresa')) return 'empresas';
  return 'otra';
}

/** Una nota, la del punto en que quedó el chat. No manda las tres. */
export async function sendVoiceNudgeOne(
  supabase: SupabaseClient,
  to: string,
  kind: CtwaVoiceNudgeKind,
  options?: { ignoreTeam?: boolean },
): Promise<{ ok: true; waMessageId: string } | { ok: false; error: string }> {
  const recipient = to.trim();
  if (!recipient) return { ok: false, error: 'Falta el destinatario.' };
  const stableKey = outboundConversationKey(recipient, BOT_PHONE_NUMBER_ID);
  const sessionBlock = await rejectIfSessionWindowClosed(supabase, stableKey);
  if (sessionBlock) return { ok: false, error: sessionBlock.error ?? 'session_closed' };
  if (await isRecipientBlocked(supabase, recipient)) {
    return { ok: false, error: 'recipient_blocked' };
  }

  const { data: conv, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('automated_inbound_disabled')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (convError) return { ok: false, error: convError.message };
  if (conv?.automated_inbound_disabled === true) {
    return { ok: false, error: 'automated_disabled' };
  }

  const { data: priorVoice, error: voiceError } = await supabase
    .from('whatsapp_message_log')
    .select('id')
    .eq('conversation_stable_key', stableKey)
    .eq('campaign_type', CTWA_VOICE_NUDGE_CAMPAIGN)
    .limit(1);
  if (voiceError) return { ok: false, error: voiceError.message };
  if ((priorVoice ?? []).length > 0) return { ok: false, error: 'already_voice' };

  const since = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
  const { data: anchors, error: anchorError } = await supabase
    .from('whatsapp_message_log')
    .select('created_at, campaign_type, message_body')
    .eq('conversation_stable_key', stableKey)
    .eq('direction', 'outbound')
    .in('campaign_type', ['CTWA_MENU', 'CTWA_ROUTE'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (anchorError) return { ok: false, error: anchorError.message };
  const anchor = anchors?.[0];
  if (!anchor?.created_at) return { ok: false, error: 'no_anchor' };
  const stage = stageFromOutbound(String(anchor.campaign_type ?? ''), String(anchor.message_body ?? ''));
  if (stage !== kind) return { ok: false, error: `stage_${stage ?? 'none'}` };

  const { data: later, error: laterError } = await supabase
    .from('whatsapp_message_log')
    .select('direction, sender_type, sent_via, message_body')
    .eq('conversation_stable_key', stableKey)
    .gt('created_at', anchor.created_at)
    .limit(50);
  if (laterError) return { ok: false, error: laterError.message };
  if (!options?.ignoreTeam) {
    for (const row of later ?? []) {
      if (row.direction === 'inbound') return { ok: false, error: 'inbound_after_anchor' };
      const fromTeam = row.direction === 'outbound'
        && (row.sender_type === 'agent' || row.sent_via === 'crm');
      if (fromTeam && isTeamTextTakeover(row.message_body)) {
        return { ok: false, error: 'agent_after_anchor' };
      }
    }
  }

  const sent = await sendVoiceNudgeAudio(supabase, {
    kind,
    recipient,
    phoneNumberId: BOT_PHONE_NUMBER_ID,
    conversationStableKey: stableKey,
    test: false,
    batch: 'ventana-abierta',
  });
  if (!sent.ok) return { ok: false, error: sent.reason };
  return { ok: true, waMessageId: sent.waMessageId };
}

export async function sendVoiceNudgeSamples(
  supabase: SupabaseClient,
  to: string,
): Promise<{ ok: true; sent: Array<{ kind: CtwaVoiceNudgeKind; waMessageId: string }> } | { ok: false; error: string }> {
  const recipient = to.trim();
  if (!recipient) return { ok: false, error: 'Falta el destinatario.' };
  const stableKey = outboundConversationKey(recipient, BOT_PHONE_NUMBER_ID);
  const sessionBlock = await rejectIfSessionWindowClosed(supabase, stableKey);
  if (sessionBlock) return { ok: false, error: sessionBlock.error ?? 'session_closed' };
  if (await isRecipientBlocked(supabase, recipient)) {
    return { ok: false, error: 'recipient_blocked' };
  }

  const sent: Array<{ kind: CtwaVoiceNudgeKind; waMessageId: string }> = [];
  const kinds: CtwaVoiceNudgeKind[] = ['menu', 'hogar', 'empresas'];
  for (const kind of kinds) {
    const result = await sendVoiceNudgeAudio(supabase, {
      kind,
      recipient,
      phoneNumberId: BOT_PHONE_NUMBER_ID,
      conversationStableKey: stableKey,
      test: true,
    });
    if (!result.ok) return { ok: false, error: `${kind}: ${result.reason}` };
    sent.push({ kind, waMessageId: result.waMessageId });
  }
  return { ok: true, sent };
}

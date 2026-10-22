import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { stampCtwaLead, type CtwaRouteAction } from './ctwaLeadProfile.ts';
import { scheduleVoiceNudgeAfterSend } from './ctwaVoiceNudge.ts';
import { BOT_PHONE_NUMBER_ID } from './whatsappLines.ts';
import {
  getGraphCredentials,
  isRecipientBlocked,
  outboundConversationKey,
  outboundCustomerPhone,
  outboundRecipientLogIdentity,
  persistOutboundLog,
  rejectIfSessionWindowClosed,
  sendToMeta,
  uploadMediaBinaryToMeta,
} from './whatsappOutbound.ts';

export const CTWA_MENU_CAMPAIGN = 'CTWA_MENU';
export const CTWA_ROUTE_CAMPAIGN = 'CTWA_ROUTE';
export const DOMESTIC_PDF_STORAGE_PATH = 'brand/limpieza-domestica.pdf';
export const DOMESTIC_PDF_FILENAME = 'Prosavis_Limpieza_Domestica.pdf';

export const CTWA_MENU_BUTTONS = [
  { id: 'ctwa_domestica', title: 'Doméstica' },
  { id: 'ctwa_empresarial', title: 'Empresarial' },
  { id: 'ctwa_empleo', title: 'Empleo' },
] as const;

const SNIPPET_BY_ACTION = {
  inicio: '/inicio',
  hogar: '/hogar',
  empresas: '/empresas',
  empleo: '/trabajo',
} as const;

export type CtwaMenuChoice = 'domestica' | 'empresarial' | 'empleo';

export type CtwaMenuAction = 'inicio' | 'hogar' | 'empresas' | 'empleo' | 'none';

export function attachesDomesticPdf(action: CtwaMenuAction): boolean {
  return action === 'hogar';
}

export interface CtwaOutboundRow {
  sentVia: string | null;
  senderType: string | null;
  campaignType: string | null;
  createdAt: string | null;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function choiceFromPlainText(body: string): CtwaMenuChoice | null {
  const text = body
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (text === '1' || text === 'domestica') return 'domestica';
  if (text === '2' || text === 'empresarial') return 'empresarial';
  if (text === '3' || text === 'empleo') return 'empleo';
  return null;
}

export function ctwaMenuChoiceFromMessage(message: JsonRecord): CtwaMenuChoice | null {
  const interactive = asRecord(message.interactive);
  const button = asRecord(interactive.button_reply);
  const id = asText(button.id) || asText(asRecord(message.button).payload);
  if (id === 'ctwa_domestica') return 'domestica';
  if (id === 'ctwa_empresarial') return 'empresarial';
  if (id === 'ctwa_empleo') return 'empleo';
  const title = asText(button.title) || asText(asRecord(message.button).text);
  const fromTitle = title ? choiceFromPlainText(title) : null;
  if (fromTitle) return fromTitle;
  const text = asRecord(message.text);
  return choiceFromPlainText(asText(text.body));
}

export function messageHasAdReferral(message: JsonRecord): boolean {
  const referral = asRecord(message.referral);
  const sourceType = asText(referral.source_type);
  if (sourceType && sourceType !== 'ad') return false;
  return Boolean(asText(referral.ctwa_clid) || asText(referral.source_id));
}

function humanTookOverAfterMenu(rows: readonly CtwaOutboundRow[]): boolean {
  const menuAt = rows
    .filter((row) => row.campaignType === CTWA_MENU_CAMPAIGN)
    .map((row) => row.createdAt || '')
    .sort()
    .at(-1);
  if (!menuAt) return false;
  return rows.some((row) =>
    (row.sentVia === 'crm' || row.senderType === 'agent')
    && (row.createdAt || '') > menuAt
  );
}

/** Qué mandar en este mensaje. `none` deja el chat en manos de una persona. */
export function decideCtwaAdMenu(input: {
  phoneNumberId: string | null;
  automatedInboundDisabled: boolean;
  hasAdReferral: boolean;
  choice: CtwaMenuChoice | null;
  outboundsSinceClick: readonly CtwaOutboundRow[];
}): CtwaMenuAction {
  if (input.phoneNumberId !== BOT_PHONE_NUMBER_ID) return 'none';
  if (input.automatedInboundDisabled) return 'none';

  const rows = input.outboundsSinceClick;
  const alreadyRouted = rows.some((row) => row.campaignType === CTWA_ROUTE_CAMPAIGN);
  const menuSent = rows.some((row) => row.campaignType === CTWA_MENU_CAMPAIGN);

  if (input.choice) {
    if (!menuSent || alreadyRouted || humanTookOverAfterMenu(rows)) return 'none';
    if (input.choice === 'domestica') return 'hogar';
    if (input.choice === 'empresarial') return 'empresas';
    return 'empleo';
  }

  if (!input.hasAdReferral) return 'none';
  if (rows.length > 0) return 'none';
  return 'inicio';
}

async function loadSnippet(supabase: SupabaseClient, shortcut: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('whatsapp_snippets')
    .select('body')
    .eq('shortcut', shortcut)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const body = asText(data?.body);
  return body ? body.slice(0, 1024) : null;
}

function routeAction(action: CtwaMenuAction): CtwaRouteAction | null {
  switch (action) {
    case 'hogar':
    case 'empresas':
    case 'empleo':
      return action;
    case 'inicio':
    case 'none':
      return null;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

interface SystemSendResult {
  ok: boolean;
  waMessageId: string | null;
  createdAt: string | null;
}

function failedSend(): SystemSendResult {
  return { ok: false, waMessageId: null, createdAt: null };
}

async function sendSystemOutbound(params: {
  supabase: SupabaseClient;
  to: string;
  phoneNumberId: string;
  text: string;
  buttons?: { id: string; title: string }[];
  campaignType: string;
}): Promise<SystemSendResult> {
  const stableKey = outboundConversationKey(params.to, params.phoneNumberId);
  const sessionBlock = await rejectIfSessionWindowClosed(params.supabase, stableKey);
  if (sessionBlock) return failedSend();
  if (await isRecipientBlocked(params.supabase, params.to)) return failedSend();

  const graph = getGraphCredentials(params.phoneNumberId);
  const metaResult = await sendToMeta({
    to: outboundCustomerPhone(params.to),
    phoneNumberId: graph.phoneNumberId,
    accessToken: graph.accessToken,
    messageBody: params.text,
    ...(params.buttons?.length ? { interactiveButtons: params.buttons } : {}),
  });
  const identity = outboundRecipientLogIdentity(params.to);
  const persisted = await persistOutboundLog(params.supabase, {
    conversation_stable_key: stableKey,
    recipient_phone: identity.recipientPhone,
    recipient_bsuid: identity.recipientBsuid,
    direction: 'outbound',
    sender_type: 'system',
    message_body: params.text,
    status: metaResult.status,
    wa_message_id: metaResult.waMessageId,
    campaign_type: params.campaignType,
    phone_number_id: graph.phoneNumberId,
    error_message: metaResult.errorMessage ?? null,
    raw_payload: {
      meta: metaResult.payload,
      ...(params.buttons?.length ? { menu_buttons: params.buttons } : {}),
    },
  }, null, 'system');

  const createdAt = persisted.createdAt ?? new Date().toISOString();
  await params.supabase
    .from('whatsapp_conversations')
    .update({
      last_message_text: params.text,
      last_message_at: createdAt,
      last_message_direction: 'outbound',
      last_message_outbound_status: metaResult.status,
    })
    .eq('stable_key', stableKey);
  if (metaResult.status !== 'sent' || !metaResult.waMessageId) return failedSend();
  return { ok: true, waMessageId: metaResult.waMessageId, createdAt };
}

async function sendDomesticPdf(params: {
  supabase: SupabaseClient;
  to: string;
  phoneNumberId: string | null;
  text: string;
}): Promise<SystemSendResult> {
  try {
    const phoneNumberId = params.phoneNumberId ?? undefined;
    const stableKey = outboundConversationKey(params.to, phoneNumberId);
    const sessionBlock = await rejectIfSessionWindowClosed(params.supabase, stableKey);
    if (sessionBlock) return failedSend();
    if (await isRecipientBlocked(params.supabase, params.to)) return failedSend();

    const { data: blob, error } = await params.supabase.storage
      .from('whatsapp-media')
      .download(DOMESTIC_PDF_STORAGE_PATH);
    if (error || !blob) throw error ?? new Error('pdf missing');

    const graph = getGraphCredentials(phoneNumberId);
    const mediaId = await uploadMediaBinaryToMeta({
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      file: blob,
      mimeType: 'application/pdf',
      filename: DOMESTIC_PDF_FILENAME,
    });
    const metaResult = await sendToMeta({
      to: outboundCustomerPhone(params.to),
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      mediaId,
      mediaType: 'document',
      caption: params.text,
      filename: DOMESTIC_PDF_FILENAME,
    });
    if (metaResult.status !== 'sent' || !metaResult.waMessageId) {
      console.error('ctwa domestic pdf skipped', metaResult.errorMessage);
      return failedSend();
    }

    const identity = outboundRecipientLogIdentity(params.to);
    const persisted = await persistOutboundLog(params.supabase, {
      conversation_stable_key: stableKey,
      recipient_phone: identity.recipientPhone,
      recipient_bsuid: identity.recipientBsuid,
      direction: 'outbound',
      sender_type: 'system',
      message_body: params.text,
      media_type: 'document',
      caption: params.text,
      filename: DOMESTIC_PDF_FILENAME,
      storage_path: DOMESTIC_PDF_STORAGE_PATH,
      mime_type: 'application/pdf',
      size_bytes: blob.size,
      media_id: mediaId,
      status: metaResult.status,
      wa_message_id: metaResult.waMessageId,
      campaign_type: CTWA_ROUTE_CAMPAIGN,
      phone_number_id: graph.phoneNumberId,
      error_message: metaResult.errorMessage ?? null,
      raw_payload: { meta: metaResult.payload },
    }, null, 'system');

    const createdAt = persisted.createdAt ?? new Date().toISOString();
    await params.supabase
      .from('whatsapp_conversations')
      .update({
        last_message_text: params.text,
        last_message_at: createdAt,
        last_message_direction: 'outbound',
        last_message_outbound_status: metaResult.status,
      })
      .eq('stable_key', stableKey);
    return { ok: true, waMessageId: metaResult.waMessageId, createdAt };
  } catch (error) {
    console.error('ctwa domestic pdf skipped', error);
    return failedSend();
  }
}

async function loadOutboundsSinceClick(
  supabase: SupabaseClient,
  stableKey: string,
  clickAt: string | null,
): Promise<CtwaOutboundRow[]> {
  let query = supabase
    .from('whatsapp_message_log')
    .select('sent_via, sender_type, campaign_type, created_at')
    .eq('conversation_stable_key', stableKey)
    .eq('direction', 'outbound');
  if (clickAt) query = query.gte('created_at', clickAt);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    sentVia: asText(row.sent_via) || null,
    senderType: asText(row.sender_type) || null,
    campaignType: asText(row.campaign_type) || null,
    createdAt: asText(row.created_at) || null,
  }));
}

/** Responde el clic de anuncio en el 312. No lanza: un fallo de envío no tumba el webhook. */
export async function runCtwaAdMenu(params: {
  supabase: SupabaseClient;
  message: JsonRecord;
  stableKey: string;
  phoneNumberId: string | null;
  to: string;
}): Promise<void> {
  try {
    if (params.phoneNumberId !== BOT_PHONE_NUMBER_ID) return;

    const { data: conv, error: convError } = await params.supabase
      .from('whatsapp_conversations')
      .select('automated_inbound_disabled, ctwa_captured_at')
      .eq('stable_key', params.stableKey)
      .maybeSingle();
    if (convError) throw new Error(convError.message);

    const choice = ctwaMenuChoiceFromMessage(params.message);
    const outbounds = await loadOutboundsSinceClick(
      params.supabase,
      params.stableKey,
      asText(conv?.ctwa_captured_at) || null,
    );
    const action = decideCtwaAdMenu({
      phoneNumberId: params.phoneNumberId,
      automatedInboundDisabled: conv?.automated_inbound_disabled === true,
      hasAdReferral: messageHasAdReferral(params.message),
      choice,
      outboundsSinceClick: outbounds,
    });
    if (action === 'none') return;

    const shortcut = SNIPPET_BY_ACTION[action];
    const text = await loadSnippet(params.supabase, shortcut);
    if (!text) return;

    const sentPdf = attachesDomesticPdf(action)
      ? await sendDomesticPdf({
        supabase: params.supabase,
        to: params.to,
        phoneNumberId: params.phoneNumberId,
        text,
      })
      : failedSend();
    const sent = sentPdf.ok
      ? sentPdf
      : await sendSystemOutbound({
        supabase: params.supabase,
        to: params.to,
        phoneNumberId: params.phoneNumberId,
        text,
        ...(action === 'inicio' ? { buttons: [...CTWA_MENU_BUTTONS] } : {}),
        campaignType: action === 'inicio' ? CTWA_MENU_CAMPAIGN : CTWA_ROUTE_CAMPAIGN,
      });
    if (sent.ok && sent.waMessageId && sent.createdAt) {
      try {
        await scheduleVoiceNudgeAfterSend({
          supabase: params.supabase,
          stableKey: params.stableKey,
          to: params.to,
          phoneNumberId: params.phoneNumberId,
          action,
          anchorWaMessageId: sent.waMessageId,
          anchorAt: sent.createdAt,
        });
      } catch (error) {
        console.error('ctwa voice nudge enqueue skipped', error);
      }
    }
    const route = routeAction(action);
    if (route) {
      await stampCtwaLead({
        supabase: params.supabase,
        stableKey: params.stableKey,
        to: params.to,
        action: route,
      });
    }
  } catch (error) {
    console.error('ctwa ad menu skipped', error);
  }
}

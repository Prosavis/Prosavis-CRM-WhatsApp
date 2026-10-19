import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
} from './whatsappOutbound.ts';

export const CTWA_MENU_CAMPAIGN = 'CTWA_MENU';
export const CTWA_ROUTE_CAMPAIGN = 'CTWA_ROUTE';

export const CTWA_MENU_BUTTONS = [
  { id: 'ctwa_domestica', title: 'Doméstica' },
  { id: 'ctwa_empresarial', title: 'Empresarial' },
  { id: 'ctwa_empleo', title: 'Empleo' },
] as const;

export const EMPRESAS_HOLD_TEXT =
  'En unos minutos te contactamos para una atención más personalizada.';

const SNIPPET_BY_ACTION = {
  inicio: '/inicio',
  hogar: '/hogar',
  empleo: '/trabajo',
} as const;

const TAG_BY_CHOICE = {
  empresas: 'Empresas',
  empleo: 'Job',
} as const;

export type CtwaMenuChoice = 'domestica' | 'empresarial' | 'empleo';

export type CtwaMenuAction = 'inicio' | 'hogar' | 'empresas' | 'empleo' | 'none';

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

async function addTag(supabase: SupabaseClient, stableKey: string, tagName: string): Promise<void> {
  const { data: tagRow, error: tagError } = await supabase
    .from('whatsapp_chat_tags')
    .select('id')
    .eq('name', tagName)
    .eq('archived', false)
    .maybeSingle();
  if (tagError) throw new Error(tagError.message);
  const tagId = asText(tagRow?.id);
  if (!tagId) return;

  const { data: conv, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('tag_ids')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (convError) throw new Error(convError.message);
  const ids = Array.isArray(conv?.tag_ids) ? conv.tag_ids.map(String) : [];
  if (ids.includes(tagId)) return;
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ tag_ids: [...ids, tagId] })
    .eq('stable_key', stableKey);
  if (error) throw new Error(error.message);
}

async function sendSystemOutbound(params: {
  supabase: SupabaseClient;
  to: string;
  phoneNumberId: string;
  text: string;
  buttons?: { id: string; title: string }[];
  campaignType: string;
}): Promise<void> {
  const stableKey = outboundConversationKey(params.to, params.phoneNumberId);
  const sessionBlock = await rejectIfSessionWindowClosed(params.supabase, stableKey);
  if (sessionBlock) return;
  if (await isRecipientBlocked(params.supabase, params.to)) return;

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

    if (action === 'empresas') {
      await sendSystemOutbound({
        supabase: params.supabase,
        to: params.to,
        phoneNumberId: params.phoneNumberId,
        text: EMPRESAS_HOLD_TEXT,
        campaignType: CTWA_ROUTE_CAMPAIGN,
      });
      await addTag(params.supabase, params.stableKey, TAG_BY_CHOICE.empresas);
      return;
    }

    const shortcut = SNIPPET_BY_ACTION[action];
    const text = await loadSnippet(params.supabase, shortcut);
    if (!text) return;

    await sendSystemOutbound({
      supabase: params.supabase,
      to: params.to,
      phoneNumberId: params.phoneNumberId,
      text,
      ...(action === 'inicio' ? { buttons: [...CTWA_MENU_BUTTONS] } : {}),
      campaignType: action === 'inicio' ? CTWA_MENU_CAMPAIGN : CTWA_ROUTE_CAMPAIGN,
    });
    if (action === 'empleo') {
      await addTag(params.supabase, params.stableKey, TAG_BY_CHOICE.empleo);
    }
  } catch (error) {
    console.error('ctwa ad menu skipped', error);
  }
}

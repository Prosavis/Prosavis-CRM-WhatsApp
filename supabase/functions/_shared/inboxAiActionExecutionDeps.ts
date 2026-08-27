import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildTemplateBodyComponents,
  normalizeTagNameForMatch,
  resolveGroundedWompiUrlForAmount,
} from './inboxAiActionHelpers.ts';
import type { InboxAiActionExecutionDeps } from './inboxAiActionExecution.ts';
import { postCrmAppointmentAction } from './firebaseHttp.ts';
import { loadDirectoryByPhone } from './inboxAiKnowledge.ts';
import {
  assertMetaSendEnabled,
  buildTemplateDisplayBody,
  ensureConversation,
  getGraphCredentials,
  isRecipientBlocked,
  outboundConversationKey,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
  WHATSAPP_API_VERSION,
} from './whatsappOutbound.ts';
import {
  normalizePhone,
  resolveRecipient,
} from './whatsappIdentity.ts';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveConversationStableKey(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rawKey: string,
): Promise<string | null> {
  const key = rawKey.trim();
  if (!key) return null;

  const { data: byStable } = await supabase
    .from('whatsapp_conversations')
    .select('stable_key')
    .eq('stable_key', key)
    .maybeSingle();
  if (byStable?.stable_key) return String(byStable.stable_key);

  if (UUID_RE.test(key)) {
    const { data: byId } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key')
      .eq('id', key)
      .maybeSingle();
    if (byId?.stable_key) return String(byId.stable_key);
  }

  return null;
}

export function createInboxAiActionExecutionDeps(params: {
  supabase: SupabaseClient;
  crmAdminId: string;
  agentUid: string;
  wabaId?: string;
}): InboxAiActionExecutionDeps {
  const { supabase, crmAdminId, agentUid } = params;
  const wabaId = params.wabaId?.trim()
    || (typeof Deno !== 'undefined' ? Deno.env.get('WHATSAPP_WABA_ID')?.trim() : undefined)
    || '';

  return {
    crmAdminId,
    async loadConversation(stableKey) {
      const resolved = await resolveConversationStableKey(supabase, stableKey);
      if (!resolved) {
        throw new Error(`Conversación no encontrada: ${stableKey}`);
      }
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('stable_key, phone, tag_ids, phone_number_id')
        .eq('stable_key', resolved)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(`Conversación no encontrada: ${stableKey}`);
      const phone = String(data.phone ?? '').trim();
      if (!phone) throw new Error('La conversación no tiene teléfono.');
      const tagIds = Array.isArray(data.tag_ids)
        ? data.tag_ids.filter((id: unknown): id is string =>
          typeof id === 'string' && id.length > 0
        )
        : [];
      return {
        stableKey: String(data.stable_key),
        phone,
        tagIds,
        phoneNumberId: data.phone_number_id
          ? String(data.phone_number_id)
          : null,
      };
    },
    async resolveTagByName(tagName) {
      const target = normalizeTagNameForMatch(tagName);
      if (!target) return null;
      const { data, error } = await supabase
        .from('whatsapp_chat_tags')
        .select('id, name, archived')
        .eq('archived', false)
        .limit(500);
      if (error) throw error;
      const match = (data ?? []).find((row) =>
        normalizeTagNameForMatch(String(row.name ?? '')) === target
      );
      if (!match?.id || !match?.name) return null;
      return { id: String(match.id), name: String(match.name) };
    },
    async updateConversationTagIds(stableKey, tagIds) {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ tag_ids: tagIds })
        .eq('stable_key', stableKey);
      if (error) throw error;
    },
    async resolveDirectoryId(phone) {
      const directory = await loadDirectoryByPhone(supabase, phone);
      return directory?.id ?? null;
    },
    async resolveGroundedPaymentUrl({ amountCOP, url }) {
      return resolveGroundedWompiUrlForAmount(amountCOP, url);
    },
    async findApprovedTemplate(templateName, languageCode) {
      if (!wabaId) return null;
      const { accessToken } = getGraphCredentials();
      const fields = encodeURIComponent('name,status,language');
      const url =
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates` +
        `?fields=${fields}&limit=100`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return null;
      const payload = await response.json() as {
        data?: Array<{ name?: string; language?: string; status?: string }>;
      };
      const wantedName = templateName.trim().toLowerCase();
      const wantedLang = languageCode.trim().toLowerCase();
      const match = (payload.data ?? []).find((row) => {
        const name = String(row.name ?? '').trim().toLowerCase();
        const language = String(row.language ?? '').trim().toLowerCase();
        const status = String(row.status ?? '').trim().toUpperCase();
        return name === wantedName
          && language === wantedLang
          && status === 'APPROVED';
      });
      if (!match?.name || !match?.language) return null;
      return { name: String(match.name), language: String(match.language) };
    },
    async sendTemplate({
      recipientPhone,
      templateName,
      templateLanguage,
      phoneNumberId,
      variables,
    }) {
      assertMetaSendEnabled();
      const phone = normalizePhone(recipientPhone);
      if (await isRecipientBlocked(supabase, phone)) {
        throw new Error('recipient_blocked');
      }
      const graph = getGraphCredentials(phoneNumberId);
      const components = buildTemplateBodyComponents(variables);
      const displayMessageBody = buildTemplateDisplayBody(
        templateName,
        components,
      );
      const metaResult = await sendToMeta({
        to: phone,
        phoneNumberId: graph.phoneNumberId,
        accessToken: graph.accessToken,
        templateName,
        templateLanguage,
        templateComponents: components,
        messageBody: displayMessageBody,
        requirePhone: true,
      });
      const stableKey = outboundConversationKey(phone, graph.phoneNumberId);
      const recipient = resolveRecipient(phone);
      await ensureConversation(
        supabase,
        stableKey,
        normalizePhone(phone),
        graph.phoneNumberId,
      );
      await persistOutboundLog(
        supabase,
        {
          conversation_stable_key: stableKey,
          recipient_phone: normalizePhone(phone),
          recipient_bsuid: recipient.bsuid ?? null,
          direction: 'outbound',
          sender_type: 'agent',
          message_body: displayMessageBody,
          status: metaResult.status,
          wa_message_id: metaResult.waMessageId,
          template_name: templateName,
          campaign_type: 'MANUAL_PANEL',
          phone_number_id: graph.phoneNumberId,
          error_message: metaResult.errorMessage ?? null,
          raw_payload: metaResult.payload,
        },
        agentUid,
      );
      const createdAt = new Date().toISOString();
      await updateConversationPreview(
        supabase,
        stableKey,
        displayMessageBody,
        metaResult.status,
        createdAt,
      );
      if (metaResult.status === 'failed') {
        throw new Error(metaResult.errorMessage ?? 'No se pudo enviar la plantilla.');
      }
      return { waMessageId: metaResult.waMessageId ?? undefined };
    },
    async postAppointmentAction(body) {
      return await postCrmAppointmentAction(body);
    },
  };
}

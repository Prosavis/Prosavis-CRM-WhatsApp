/**
 * Lote empresas: 50 WhatsApp (bot 312, outreach_empresas_limpieza_v2) + 50 correos.
 * Auth: x-api-key (REMINDER_API_KEY / REACTIVATION_API_KEY).
 */
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { assertBotOnlyAutomation, BOT_PHONE_NUMBER_ID } from '../_shared/whatsappLines.ts';
import { applyColdFailureTag } from '../_shared/coldAppUserOutreach.ts';
import {
  assertMetaSendEnabled,
  ensureConversation,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import { getStableKeyFromRecipient, normalizePhone, resolveRecipient } from '../_shared/whatsappIdentity.ts';
import {
  EMPRESAS_TAG,
  EMPRESAS_TAG_ID,
  EMPRESAS_WA_BODY,
  EMPRESAS_WA_CAMPAIGN,
  EMPRESAS_WA_TEMPLATE,
  EMAIL_ENVIADO_TAG,
  EMAIL_ENVIADO_TAG_ID,
  buildDirectoryUpsert,
  buildRfc822,
  composeEmpresasEmail,
  e164FromPhoneKey,
  toBase64Url,
  type EmpresasLeadRow,
} from '../_shared/empresasOutreach.ts';

function verifyApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key')?.trim();
  const expected =
    Deno.env.get('REACTIVATION_API_KEY')?.trim() ||
    Deno.env.get('REMINDER_API_KEY')?.trim() ||
    Deno.env.get('COLD_OUTREACH_API_KEY')?.trim();
  return Boolean(apiKey && expected && apiKey === expected);
}

const DELAY_WA_MS = 3_000;
const DELAY_EMAIL_MS = 400;
const TIME_BUDGET_MS = 380_000;

type SupabaseClient = ReturnType<typeof getServiceClient>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function env(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

async function googleAccessToken(): Promise<{ token: string; from: string } | null> {
  const refreshToken = env('GMAIL_OPS_REFRESH_TOKEN');
  const clientId = env('GMAIL_OPS_CLIENT_ID');
  const clientSecret = env('GMAIL_OPS_CLIENT_SECRET');
  if (!refreshToken || !clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json() as { access_token?: string };
  if (!res.ok || !json.access_token) return null;
  return { token: json.access_token, from: env('GMAIL_OPS_FROM') || 'support@prosavis.com' };
}

async function mergeDirectoryTag(
  supabase: SupabaseClient,
  directoryId: string,
  tagName: string,
) {
  const { data } = await supabase
    .from('crm_directory')
    .select('tags')
    .eq('id', directoryId)
    .maybeSingle();
  const current: string[] = Array.isArray(data?.tags) ? data.tags : [];
  if (current.some((t) => t.toLowerCase() === tagName.toLowerCase())) return;
  await supabase
    .from('crm_directory')
    .update({ tags: [...current, tagName], updated_at: new Date().toISOString() })
    .eq('id', directoryId);
}

async function mergeInboxTag(
  supabase: SupabaseClient,
  phoneKey: string,
  tagId: string,
) {
  const { data: convs } = await supabase
    .from('whatsapp_conversations')
    .select('stable_key, tag_ids')
    .eq('phone_key', phoneKey)
    .limit(5);
  for (const conv of convs ?? []) {
    const ids: string[] = Array.isArray(conv.tag_ids) ? conv.tag_ids : [];
    if (ids.includes(tagId)) continue;
    await supabase
      .from('whatsapp_conversations')
      .update({ tag_ids: [...ids, tagId] })
      .eq('stable_key', conv.stable_key);
  }
}

async function promoteLead(
  supabase: SupabaseClient,
  row: EmpresasLeadRow,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_directory_entry', {
    p_entry: buildDirectoryUpsert(row),
    p_overwrite_classification: false,
    p_replace_tags: false,
  });
  if (error) {
    console.warn('[empresas-outreach] upsert_directory_entry', error.message);
    return null;
  }
  return data ? String(data) : null;
}

async function sendWhatsAppOne(
  supabase: SupabaseClient,
  graph: { phoneNumberId: string; accessToken: string },
  row: EmpresasLeadRow,
): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string }> {
  const phoneKey = row.phone_key || '';
  const phone = normalizePhone(e164FromPhoneKey(phoneKey));
  if (!phoneKey || phone.length < 10) {
    return { status: 'skipped', error: 'Teléfono inválido' };
  }
  if (await isRecipientBlocked(supabase, phone)) {
    return { status: 'skipped', error: 'Destinatario bloqueado' };
  }
  const directoryId = await promoteLead(supabase, row);
  let metaResult;
  try {
    metaResult = await sendToMeta({
      to: phone,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName: EMPRESAS_WA_TEMPLATE,
      templateLanguage: 'es_CO',
      messageBody: EMPRESAS_WA_BODY,
      requirePhone: true,
    });
  } catch (err) {
    return { status: 'failed', error: formatError(err) };
  }
  const stableKey = getStableKeyFromRecipient(phone);
  const resolved = resolveRecipient(phone);
  await ensureConversation(supabase, stableKey, phone, graph.phoneNumberId, row.name);
  const createdAt = new Date().toISOString();
  try {
    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: phone,
        recipient_bsuid: resolved.bsuid ?? null,
        direction: 'outbound',
        sender_type: 'system',
        message_body: EMPRESAS_WA_BODY,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: EMPRESAS_WA_TEMPLATE,
        campaign_type: EMPRESAS_WA_CAMPAIGN,
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: metaResult.payload,
      },
      // Worker CLI: sin agent_uid (FK retry pone null).
      // deno-lint-ignore no-explicit-any
      undefined as any,
    );
    await updateConversationPreview(
      supabase,
      stableKey,
      EMPRESAS_WA_BODY,
      metaResult.status,
      persisted.createdAt ?? createdAt,
    );
  } catch (logErr) {
    console.error('[empresas-outreach] persistOutboundLog', formatError(logErr));
  }
  if (directoryId) {
    await mergeDirectoryTag(supabase, directoryId, EMPRESAS_TAG);
    await supabase.from('outreach_leads').update({
      crm_directory_id: directoryId,
      wa_status: metaResult.status === 'sent' ? 'sent' : 'failed',
      last_wa_at: createdAt,
    }).eq('id', row.id);
  } else {
    await supabase.from('outreach_leads').update({
      wa_status: metaResult.status === 'sent' ? 'sent' : 'failed',
      last_wa_at: createdAt,
    }).eq('id', row.id);
  }
  await mergeInboxTag(supabase, phoneKey, EMPRESAS_TAG_ID);
  if (metaResult.status !== 'sent') {
    await applyColdFailureTag(supabase, {
      directoryId,
      phone,
      errorMessage: metaResult.errorMessage,
    });
    return { status: 'failed', error: metaResult.errorMessage ?? 'Meta failed' };
  }
  return { status: 'sent' };
}

async function sendEmailOne(
  supabase: SupabaseClient,
  gmail: { token: string; from: string },
  row: EmpresasLeadRow,
): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string }> {
  const email = (row.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { status: 'skipped', error: 'Sin correo' };
  const composed = composeEmpresasEmail(row, email);
  const rfc822 = buildRfc822({
    from: gmail.from,
    to: composed.to,
    subject: composed.subject,
    body: composed.body,
    htmlBody: composed.htmlBody,
  });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gmail.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(rfc822) }),
  });
  const json = await res.json() as { id?: string; error?: { message?: string } };
  const createdAt = new Date().toISOString();
  if (!res.ok) {
    await supabase.from('outreach_leads').update({
      email_status: 'failed',
      last_email_at: createdAt,
      exclude_reason: json.error?.message || `HTTP ${res.status}`,
    }).eq('id', row.id);
    return { status: 'failed', error: json.error?.message || `HTTP ${res.status}` };
  }
  const directoryId = await promoteLead(supabase, row);
  if (directoryId) {
    await mergeDirectoryTag(supabase, directoryId, EMAIL_ENVIADO_TAG);
    if (row.phone_key) await mergeDirectoryTag(supabase, directoryId, EMPRESAS_TAG);
    await supabase.from('outreach_leads').update({
      crm_directory_id: directoryId,
      email_status: 'sent',
      last_email_at: createdAt,
    }).eq('id', row.id);
    if (row.phone_key) {
      await mergeInboxTag(supabase, row.phone_key, EMAIL_ENVIADO_TAG_ID);
      await mergeInboxTag(supabase, row.phone_key, EMPRESAS_TAG_ID);
    }
  } else {
    await supabase.from('outreach_leads').update({
      email_status: 'sent',
      last_email_at: createdAt,
    }).eq('id', row.id);
  }
  return { status: 'sent' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!verifyApiKey(req)) return jsonResponse({ error: 'No autorizado.' }, 401);
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const channel = String(body.channel || 'both').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 50);
    const doWa = channel === 'whatsapp' || channel === 'both';
    const doEmail = channel === 'email' || channel === 'both';
    const supabase = getServiceClient();
    const started = Date.now();

    const stats = {
      waSent: 0,
      waFailed: 0,
      waSkipped: 0,
      emailSent: 0,
      emailFailed: 0,
      emailSkipped: 0,
      emailSkippedNoSecrets: 0,
    };

    if (doWa) {
      const { data, error } = await supabase.rpc('list_empresas_outreach_wa_eligible', {
        p_limit: limit,
      });
      if (error) throw error;
      const rows = (data ?? []) as EmpresasLeadRow[];
      if (dryRun) {
        stats.waSkipped = rows.length;
      } else {
        try {
          assertMetaSendEnabled();
        } catch (err) {
          return jsonResponse({ error: String(err) }, 503);
        }
        const graph = getGraphCredentials(BOT_PHONE_NUMBER_ID);
        assertBotOnlyAutomation(graph.phoneNumberId);
        for (const row of rows) {
          if (Date.now() - started > TIME_BUDGET_MS) break;
          const result = await sendWhatsAppOne(supabase, graph, row);
          if (result.status === 'sent') stats.waSent += 1;
          else if (result.status === 'failed') stats.waFailed += 1;
          else stats.waSkipped += 1;
          await sleep(DELAY_WA_MS);
        }
      }
    }

    if (doEmail) {
      const { data, error } = await supabase.rpc('list_empresas_outreach_email_eligible', {
        p_limit: limit,
      });
      if (error) throw error;
      const rows = (data ?? []) as EmpresasLeadRow[];
      if (dryRun) {
        stats.emailSkipped = rows.length;
      } else {
        const gmail = await googleAccessToken();
        if (!gmail) {
          stats.emailSkippedNoSecrets = rows.length;
        } else {
          for (const row of rows) {
            if (Date.now() - started > TIME_BUDGET_MS) break;
            const result = await sendEmailOne(supabase, gmail, row);
            if (result.status === 'sent') stats.emailSent += 1;
            else if (result.status === 'failed') stats.emailFailed += 1;
            else stats.emailSkipped += 1;
            await sleep(DELAY_EMAIL_MS);
          }
        }
      }
    }

    return jsonResponse({
      success: true,
      dryRun,
      channel,
      limit,
      stats,
      schedulerName: body.schedulerName ?? null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

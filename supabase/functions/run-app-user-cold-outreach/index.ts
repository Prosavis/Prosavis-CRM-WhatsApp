// Activación en frío: usuarios app (crm_directory) → promo_general (sin nombre).
// Acciones: preview | start | continue | retry
// Chunks reanudables (delay 5–10s) para no chocar el límite ~150s del worker.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, requireCrmAdmin } from '../_shared/supabase.ts';
import {
  applyColdFailureTag,
  buildColdDisplayBody,
  buildDirectoryUpsertPayload,
  COLD_CONFIRM_PHRASE,
  COLD_GENERIC_TEMPLATE,
  COLD_JOB_KIND,
  COLD_APP_USER_CAMPAIGN_TYPE,
  planRecipientFromDirectory,
  type ColdEligibleRow,
  type ColdRecipientPlan,
} from '../_shared/coldAppUserOutreach.ts';
import {
  assertMetaSendEnabled,
  ensureConversation,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import { getStableKeyFromRecipient, normalizePhone, resolveRecipient } from '../_shared/whatsappIdentity.ts';

function verifyWorkerApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key')?.trim();
  const expected =
    Deno.env.get('COLD_OUTREACH_API_KEY')?.trim() ||
    Deno.env.get('REACTIVATION_API_KEY')?.trim() ||
    Deno.env.get('REMINDER_API_KEY')?.trim();
  return Boolean(apiKey && expected && apiKey === expected);
}

const CHUNK_SIZE_DEFAULT = 12;
const CHUNK_SIZE_MAX = 18;
const TIME_BUDGET_MS = 110_000;
const DELAY_FAST_MS = 5_000;
const DELAY_SLOW_MS = 10_000;
const PREVIEW_SAMPLE = 25;
const MAX_MATERIALIZE = 10_000;

type SupabaseClient = Awaited<ReturnType<typeof requireCrmAdmin>>['supabase'];

interface JobPayload {
  kind: typeof COLD_JOB_KIND;
  templateLanguage: string;
  templateName: string;
  pilotLimit: number | null;
  phoneNumberId?: string;
}

interface RecipientRow {
  id: string;
  phone: string;
  name: string | null;
  directory_id: string | null;
  template_name: string | null;
  attempts: number;
}

interface JobCounts {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCounts(supabase: SupabaseClient, jobId: string): Promise<JobCounts> {
  const { data, error } = await supabase.rpc('broadcast_job_counts', { p_job_id: jobId });
  if (error) throw error;
  const c = (data ?? {}) as Partial<JobCounts>;
  return {
    pending: c.pending ?? 0,
    sent: c.sent ?? 0,
    failed: c.failed ?? 0,
    skipped: c.skipped ?? 0,
    total: c.total ?? 0,
  };
}

async function loadEligiblePlans(
  supabase: SupabaseClient,
  pilotLimit: number | null,
): Promise<ColdRecipientPlan[]> {
  // PostgREST max_rows=1000: hay que paginar el RPC.
  const pageSize = 1000;
  const target = pilotLimit && pilotLimit > 0
    ? Math.min(pilotLimit, MAX_MATERIALIZE)
    : MAX_MATERIALIZE;

  const plans: ColdRecipientPlan[] = [];
  const seenPhone = new Set<string>();
  let offset = 0;

  while (plans.length < target) {
    const { data, error } = await supabase.rpc('list_cold_app_user_outreach_eligible', {
      p_limit: pageSize,
      p_offset: offset,
    });
    if (error) throw error;
    const rows = (data ?? []) as ColdEligibleRow[];
    if (!rows.length) break;

    for (const row of rows) {
      const plan = planRecipientFromDirectory(row);
      if (!plan) continue;
      if (seenPhone.has(plan.phone)) continue;
      seenPhone.add(plan.phone);
      plans.push(plan);
      if (plans.length >= target) break;
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  return plans;
}

async function processRecipient(
  supabase: SupabaseClient,
  graph: { phoneNumberId: string; accessToken: string },
  agentUid: string | null,
  templateLanguage: string,
  recipient: RecipientRow,
): Promise<{
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  waMessageId?: string;
  delayMs: number;
  templateName?: string;
}> {
  const phone = normalizePhone(String(recipient.phone ?? '').trim());
  if (!phone || phone.length < 10) {
    return { status: 'skipped', error: 'Teléfono inválido', delayMs: 0 };
  }

  let delayMs = DELAY_FAST_MS;
  let directoryId = recipient.directory_id;

  // Merge fill-only si tenemos directory_id (o intentamos por phone vía upsert).
  if (directoryId) {
    const { data: dirRow } = await supabase
      .from('crm_directory')
      .select('id, phone, phone_key, display_name, full_name, app_user_id, tags')
      .eq('id', directoryId)
      .maybeSingle();

    if (dirRow) {
      const plan = planRecipientFromDirectory(dirRow as ColdEligibleRow);
      if (plan) {
        const upsertEntry = buildDirectoryUpsertPayload(plan);
        const { data: upsertedId, error: upsertErr } = await supabase.rpc('upsert_directory_entry', {
          p_entry: upsertEntry,
          p_overwrite_classification: false,
          p_replace_tags: false,
        });
        if (upsertErr) {
          delayMs = DELAY_SLOW_MS;
          console.warn('[cold-outreach] upsert_directory_entry', upsertErr.message);
        } else if (upsertedId) {
          directoryId = String(upsertedId);
          if (String(upsertedId) !== recipient.directory_id) delayMs = DELAY_SLOW_MS;
        }
      }
    }
  }

  if (await isRecipientBlocked(supabase, phone)) {
    return { status: 'skipped', error: 'Destinatario bloqueado', delayMs: 0 };
  }

  if (directoryId) {
    const { data: optRows } = await supabase
      .from('crm_directory')
      .select('opt_out, active_sequence')
      .eq('id', directoryId)
      .maybeSingle();
    if (optRows?.opt_out) {
      return { status: 'skipped', error: 'Opt-out', delayMs: 0 };
    }
    if (optRows?.active_sequence === 'REACTIVACION') {
      return { status: 'skipped', error: 'En secuencia REACTIVACION', delayMs: 0 };
    }
  }

  // Política actual: siempre promo_general (sin {{1}} / sin nombre).
  const resolvedTemplate = COLD_GENERIC_TEMPLATE;
  const displayMessageBody = buildColdDisplayBody();

  let metaResult;
  try {
    metaResult = await sendToMeta({
      to: phone,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName: resolvedTemplate,
      templateLanguage,
      messageBody: displayMessageBody,
      requirePhone: true,
    });
  } catch (e) {
    return { status: 'failed', error: formatError(e), delayMs: DELAY_SLOW_MS, templateName: resolvedTemplate };
  }

  if (metaResult.status !== 'sent') {
    delayMs = DELAY_SLOW_MS;
  }

  const stableKey = getStableKeyFromRecipient(phone);
  const resolved = resolveRecipient(phone);

  await ensureConversation(supabase, stableKey, phone, graph.phoneNumberId, null);

  let createdAt = new Date().toISOString();
  try {
    // Worker CLI / scheduler: sin agent_uid (igual que reactivaciones / reminders).
    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: phone,
        recipient_bsuid: resolved.bsuid ?? null,
        direction: 'outbound',
        sender_type: agentUid ? 'agent' : 'system',
        message_body: displayMessageBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: resolvedTemplate,
        campaign_type: COLD_APP_USER_CAMPAIGN_TYPE,
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: metaResult.payload,
      },
      // deno-lint-ignore no-explicit-any
      agentUid as any,
    );
    createdAt = persisted.createdAt ?? createdAt;
  } catch (logErr) {
    // Meta ya pudo haber aceptado el mensaje: no degradar a failed por un fallo de log.
    console.error('[cold-outreach] persistOutboundLog', formatError(logErr));
    if (metaResult.status !== 'sent') {
      return {
        status: 'failed',
        error: formatError(logErr),
        delayMs: DELAY_SLOW_MS,
        templateName: resolvedTemplate,
      };
    }
  }

  await updateConversationPreview(supabase, stableKey, displayMessageBody, metaResult.status, createdAt);

  // last_contact solo por id resuelto (nunca por teléfono a ciegas).
  if (directoryId && metaResult.status === 'sent') {
    await supabase
      .from('crm_directory')
      .update({ last_contact_at: createdAt })
      .eq('id', directoryId);
  }

  if (metaResult.status === 'sent') {
    return {
      status: 'sent',
      waMessageId: metaResult.waMessageId ?? undefined,
      delayMs,
      templateName: resolvedTemplate,
    };
  }
  return {
    status: 'failed',
    error: metaResult.errorMessage ?? 'Meta no confirmó el envío',
    delayMs: DELAY_SLOW_MS,
    templateName: resolvedTemplate,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    // Auth: CRM admin JWT o worker x-api-key (scripts CLI / scheduler).
    let supabase: SupabaseClient;
    let agentUid: string | null;
    if (verifyWorkerApiKey(req)) {
      supabase = getServiceClient();
      // System jobs: agent_uid debe ser null (columna uuid → auth.users).
      agentUid = null;
    } else {
      const admin = await requireCrmAdmin(req);
      supabase = admin.supabase;
      agentUid = admin.user.id;
    }

    const action: 'preview' | 'start' | 'continue' | 'retry' =
      body.action === 'preview' ||
        body.action === 'continue' ||
        body.action === 'retry' ||
        body.action === 'start'
        ? body.action
        : body.jobId
          ? 'continue'
          : 'preview';

    // ── Preview / dry-run (sin Meta, sin job) ────────────────────────────────
    if (action === 'preview') {
      const pilotLimit =
        body.pilotLimit != null && Number(body.pilotLimit) > 0
          ? Math.min(Number(body.pilotLimit), MAX_MATERIALIZE)
          : null;

      const { data: totalData, error: countErr } = await supabase.rpc(
        'count_cold_app_user_outreach_eligible',
      );
      if (countErr) throw countErr;

      // Sin tope: materializa planes para breakdown real; con piloto: solo ese cupo.
      const plans = await loadEligiblePlans(supabase, pilotLimit);
      const sample = plans.slice(0, PREVIEW_SAMPLE).map((p) => ({
        directoryId: p.directoryId,
        phone: p.phone,
        phoneKey: p.phoneKey,
        firstName: p.firstName,
        templateName: p.templateName,
        displayName: p.displayName,
      }));

      return jsonResponse({
        dryRun: true,
        eligibleTotal: Number(totalData ?? 0),
        plannedCount: plans.length,
        sampleSize: sample.length,
        sample,
        templateBreakdown: {
          [COLD_GENERIC_TEMPLATE]: plans.length,
        },
        templatePolicy: 'promo_general_only',
        exclusions: [
          'active_sequence = REACTIVACION',
          'opt_out',
          'whatsapp_blocklist',
          'tags Auxiliares/test/Decline/Bloqueado',
          'reactivations_enabled = false',
          'outbound WA últimos 7 días',
          'teléfono no móvil CO',
        ],
      });
    }

    assertMetaSendEnabled();

    const chunkSize = Math.max(
      3,
      Math.min(Number(body.chunkSize) || CHUNK_SIZE_DEFAULT, CHUNK_SIZE_MAX),
    );

    let jobId: string;
    let payload: JobPayload;

    if (action === 'start') {
      if (String(body.confirmation ?? '') !== COLD_CONFIRM_PHRASE) {
        return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
      }

      const pilotLimit =
        body.pilotLimit != null && Number(body.pilotLimit) > 0
          ? Math.min(Number(body.pilotLimit), MAX_MATERIALIZE)
          : null;

      payload = {
        kind: COLD_JOB_KIND,
        templateLanguage: body.templateLanguage ? String(body.templateLanguage) : 'es_CO',
        templateName: COLD_GENERIC_TEMPLATE,
        pilotLimit,
        phoneNumberId: body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined,
      };

      getGraphCredentials(payload.phoneNumberId);

      const plans = await loadEligiblePlans(supabase, pilotLimit);
      if (!plans.length) {
        return jsonResponse({ error: 'Sin destinatarios elegibles.' }, 400);
      }

      const { data: job, error: jobError } = await supabase
        .from('whatsapp_broadcast_jobs')
        .insert({
          status: 'processing',
          total_recipients: plans.length,
          sent: 0,
          failed: 0,
          skipped: 0,
          template_name: COLD_GENERIC_TEMPLATE,
          rich_body_preview: `Activación frío app · promo_general · ${plans.length} destinatarios`,
          message_payload: payload,
          job_kind: COLD_JOB_KIND,
          created_by: agentUid,
        })
        .select('id')
        .single();
      if (jobError) throw jobError;
      jobId = job.id as string;

      const rows = plans.map((p) => ({
        job_id: jobId,
        phone: p.phone,
        name: null as string | null,
        directory_id: p.directoryId,
        template_name: COLD_GENERIC_TEMPLATE,
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error: insErr } = await supabase
          .from('whatsapp_broadcast_recipients')
          .upsert(slice, { onConflict: 'job_id,phone', ignoreDuplicates: true });
        if (insErr) throw insErr;
      }

      const initialCounts = await getCounts(supabase, jobId);
      await supabase
        .from('whatsapp_broadcast_jobs')
        .update({ total_recipients: initialCounts.total })
        .eq('id', jobId);
    } else {
      jobId = String(body.jobId ?? '').trim();
      if (!jobId) return jsonResponse({ error: 'jobId requerido.' }, 400);

      const { data: job, error: jobErr } = await supabase
        .from('whatsapp_broadcast_jobs')
        .select('message_payload, job_kind')
        .eq('id', jobId)
        .single();
      if (jobErr) throw jobErr;

      payload = (job.message_payload ?? {}) as JobPayload;
      if (payload.kind !== COLD_JOB_KIND && job.job_kind !== COLD_JOB_KIND) {
        return jsonResponse({ error: 'Este job no es de activación en frío.' }, 400);
      }
      if (!payload.kind) {
        payload = {
          kind: COLD_JOB_KIND,
          templateLanguage: 'es_CO',
          templateName: COLD_GENERIC_TEMPLATE,
          pilotLimit: null,
        };
      }

      if (action === 'retry') {
        await supabase
          .from('whatsapp_broadcast_recipients')
          .update({ status: 'pending', error_message: null })
          .eq('job_id', jobId)
          .eq('status', 'failed');
        await supabase
          .from('whatsapp_broadcast_jobs')
          .update({ status: 'processing', completed_at: null })
          .eq('id', jobId);
      }
    }

    const graph = getGraphCredentials(payload.phoneNumberId);

    const { data: chunkData, error: chunkErr } = await supabase
      .from('whatsapp_broadcast_recipients')
      .select('id, phone, name, directory_id, template_name, attempts')
      .eq('job_id', jobId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(chunkSize);
    if (chunkErr) throw chunkErr;
    const chunk = (chunkData ?? []) as RecipientRow[];

    const startedAt = Date.now();
    let processed = 0;

    for (let i = 0; i < chunk.length; i += 1) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const recipient = chunk[i];

      let outcome: {
        status: 'sent' | 'failed' | 'skipped';
        error?: string;
        waMessageId?: string;
        delayMs: number;
        templateName?: string;
      };
      try {
        outcome = await processRecipient(
          supabase,
          graph,
          agentUid,
          payload.templateLanguage ?? 'es_CO',
          recipient,
        );
      } catch (e) {
        outcome = { status: 'failed', error: formatError(e), delayMs: DELAY_SLOW_MS };
      }

      await supabase
        .from('whatsapp_broadcast_recipients')
        .update({
          status: outcome.status,
          error_message: outcome.error ?? null,
          wa_message_id: outcome.waMessageId ?? null,
          template_name: outcome.templateName ?? recipient.template_name ?? COLD_GENERIC_TEMPLATE,
          attempts: (recipient.attempts ?? 0) + 1,
          processed_at: new Date().toISOString(),
        })
        .eq('id', recipient.id);

      if (outcome.status === 'failed') {
        try {
          await applyColdFailureTag(supabase, {
            directoryId: recipient.directory_id,
            phone: String(recipient.phone ?? ''),
            errorMessage: outcome.error,
          });
        } catch (tagErr) {
          console.warn('[cold-outreach] applyColdFailureTag', formatError(tagErr));
        }
      }

      processed += 1;

      if (outcome.status !== 'skipped' && i < chunk.length - 1) {
        await sleep(outcome.delayMs || DELAY_FAST_MS);
      }
    }

    const counts = await getCounts(supabase, jobId);
    const remaining = counts.pending;
    const done = remaining === 0;
    await supabase
      .from('whatsapp_broadcast_jobs')
      .update({
        sent: counts.sent,
        failed: counts.failed,
        skipped: counts.skipped,
        status: done ? 'completed' : 'processing',
        last_progress_at: new Date().toISOString(),
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq('id', jobId);

    return jsonResponse({
      jobId,
      status: done ? 'completed' : 'processing',
      chunkProcessed: processed,
      remaining,
      totals: counts,
      campaignType: COLD_APP_USER_CAMPAIGN_TYPE,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

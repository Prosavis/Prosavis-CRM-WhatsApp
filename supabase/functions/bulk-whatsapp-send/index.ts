// bulk-whatsapp-send: envío masivo WhatsApp REANUDABLE por lotes.
//
// Problema previo: procesaba TODOS los destinatarios en una sola invocación con
// una pausa entre cada uno, superando el límite duro de ~150s del worker
// (WORKER_RESOURCE_LIMIT / 546) y sin registrar a quién sí/no se le envió.
//
// Diseño:
//  - 'start'   : crea el job, guarda la config del mensaje (message_payload) y los
//                destinatarios (whatsapp_broadcast_recipients, status=pending), y
//                procesa el PRIMER lote.
//  - 'continue': procesa el siguiente lote de pendientes del job.
//  - 'retry'   : reabre los 'failed' a 'pending' y procesa un lote (reintento de los
//                que faltaron).
//  Cada invocación procesa un lote pequeño (con tope de tiempo) y devuelve
//  `remaining` + conteos para que el frontend itere hasta terminar. Así se sabe
//  exactamente quién recibió el mensaje y quién quedó pendiente/fallido.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  assertMetaSendEnabled,
  buildTemplateDisplayBody,
  ensureConversation,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendTextOutbound,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import { directoryPhoneLookupVariants } from '../_shared/directoryPhone.ts';
import { getStableKeyFromRecipient, normalizePhone, resolveRecipient } from '../_shared/whatsappIdentity.ts';

const BULK_CONFIRM_PHRASE = 'CONFIRMAR_ENVIO_MASIVO';
const BATCH_DELAY_MS = 1200;
// Tope de destinatarios por invocación (con la pausa, se mantiene muy por debajo de 150s).
const CHUNK_SIZE_DEFAULT = 25;
const CHUNK_SIZE_MAX = 50;
// Tope de tiempo de proceso por invocación; el resto queda pendiente para el siguiente lote.
const TIME_BUDGET_MS = 110_000;
const MAX_RECIPIENTS = 500;

type SupabaseClient = Awaited<ReturnType<typeof requireCrmAdmin>>['supabase'];

interface JobPayload {
  mode: 'template' | 'text';
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: Array<Record<string, unknown>>;
  displayMessageBody?: string;
  richBody?: string;
  phoneNumberId?: string;
}

interface RecipientRow {
  id: string;
  phone: string;
  name: string | null;
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

/** Envía a un destinatario y devuelve el resultado para registrar su estado. */
async function processRecipient(
  supabase: SupabaseClient,
  payload: JobPayload,
  graph: { phoneNumberId: string; accessToken: string },
  agentUid: string,
  recipient: RecipientRow,
): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string; waMessageId?: string }> {
  const phone = normalizePhone(String(recipient.phone ?? '').trim());
  if (!phone || phone.length < 10) return { status: 'skipped', error: 'Teléfono inválido' };

  if (await isRecipientBlocked(supabase, phone)) return { status: 'skipped', error: 'Destinatario bloqueado' };

  const phoneVariants = directoryPhoneLookupVariants(phone);
  const lookupPhones = phoneVariants.length > 0 ? phoneVariants : [phone];
  const { data: directoryRows } = await supabase
    .from('crm_directory')
    .select('opt_out')
    .in('phone', lookupPhones)
    .limit(1);
  if (directoryRows?.[0]?.opt_out) return { status: 'skipped', error: 'Opt-out' };

  const contactName = recipient.name ? String(recipient.name).trim() : null;

  if (payload.mode === 'template') {
    const templateName = String(payload.templateName ?? '').trim();
    const displayMessageBody =
      (payload.displayMessageBody ? String(payload.displayMessageBody).trim() : '') ||
      buildTemplateDisplayBody(templateName, payload.templateComponents);

    const metaResult = await sendToMeta({
      to: phone,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName,
      templateLanguage: payload.templateLanguage ?? 'es_CO',
      templateComponents: payload.templateComponents,
      messageBody: displayMessageBody,
      requirePhone: true,
    });

    const stableKey = getStableKeyFromRecipient(phone);
    const resolved = resolveRecipient(phone);

    await ensureConversation(supabase, stableKey, phone, graph.phoneNumberId, contactName);

    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: phone,
        recipient_bsuid: resolved.bsuid ?? null,
        direction: 'outbound',
        sender_type: 'agent',
        message_body: displayMessageBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: templateName,
        campaign_type: 'BULK_PANEL',
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: metaResult.payload,
      },
      agentUid,
    );

    const createdAt = persisted.createdAt ?? new Date().toISOString();
    await updateConversationPreview(supabase, stableKey, displayMessageBody, metaResult.status, createdAt);

    if (metaResult.status === 'sent') {
      return { status: 'sent', waMessageId: metaResult.waMessageId ?? undefined };
    }
    return { status: 'failed', error: metaResult.errorMessage ?? 'Meta no confirmó el envío' };
  }

  const result = await sendTextOutbound(supabase, {
    to: phone,
    text: String(payload.richBody ?? ''),
    phoneNumberId: payload.phoneNumberId,
    agentUid,
    campaignType: 'BULK_PANEL',
    templateName: 'bulk_rich',
    contactName,
  });
  if (result.success) return { status: 'sent' };
  return { status: 'failed', error: 'No se pudo enviar el mensaje de texto' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    assertMetaSendEnabled();

    const action: 'start' | 'continue' | 'retry' =
      body.action === 'continue' || body.action === 'retry'
        ? body.action
        : body.jobId
          ? 'continue'
          : 'start';

    const chunkSize = Math.max(
      5,
      Math.min(Number(body.chunkSize) || CHUNK_SIZE_DEFAULT, CHUNK_SIZE_MAX),
    );

    let jobId: string;
    let payload: JobPayload;

    if (action === 'start') {
      if (String(body.confirmation ?? '') !== BULK_CONFIRM_PHRASE) {
        return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
      }

      const recipients = (body.recipients ?? []) as Array<{ phone: string; name?: string }>;
      if (!recipients.length) return jsonResponse({ error: 'Sin destinatarios.' }, 400);
      if (recipients.length > MAX_RECIPIENTS) {
        return jsonResponse({ error: `Máximo ${MAX_RECIPIENTS} destinatarios por envío.` }, 400);
      }

      const isTemplateMode = Boolean(body.templateName);
      const richBody = body.richBody ? String(body.richBody).trim() : '';
      if (!isTemplateMode && !richBody) {
        return jsonResponse({ error: 'Se requiere templateName o richBody.' }, 400);
      }

      payload = {
        mode: isTemplateMode ? 'template' : 'text',
        templateName: body.templateName ? String(body.templateName).trim() : undefined,
        templateLanguage: body.templateLanguage ? String(body.templateLanguage) : 'es_CO',
        templateComponents: body.templateComponents as Array<Record<string, unknown>> | undefined,
        displayMessageBody: body.displayMessageBody ? String(body.displayMessageBody).trim() : undefined,
        richBody: richBody || undefined,
        phoneNumberId: body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined,
      };

      // Validamos credenciales antes de crear el job (evita jobs huérfanos).
      getGraphCredentials(payload.phoneNumberId);

      const { data: job, error: jobError } = await supabase
        .from('whatsapp_broadcast_jobs')
        .insert({
          status: 'processing',
          total_recipients: recipients.length,
          sent: 0,
          failed: 0,
          skipped: 0,
          template_name: payload.templateName ?? null,
          rich_body_preview: payload.richBody ? payload.richBody.slice(0, 200) : null,
          message_payload: payload,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (jobError) throw jobError;
      jobId = job.id as string;

      // Insertar destinatarios (dedupe por job_id+phone). Normalizamos el teléfono.
      const seen = new Set<string>();
      const rows = recipients
        .map((r) => ({
          job_id: jobId,
          phone: normalizePhone(String(r.phone ?? '').trim()),
          name: r.name ? String(r.name).trim() : null,
        }))
        .filter((r) => r.phone && !seen.has(r.phone) && seen.add(r.phone));

      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { error: insErr } = await supabase
          .from('whatsapp_broadcast_recipients')
          .upsert(slice, { onConflict: 'job_id,phone', ignoreDuplicates: true });
        if (insErr) throw insErr;
      }

      // Ajustar total real tras dedupe.
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
        .select('message_payload')
        .eq('id', jobId)
        .single();
      if (jobErr) throw jobErr;
      payload = (job.message_payload ?? {}) as JobPayload;
      if (!payload.mode) return jsonResponse({ error: 'El job no tiene configuración de mensaje.' }, 400);

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

    // ── Procesar un lote de pendientes (con tope de tiempo) ──────────────────
    const { data: chunkData, error: chunkErr } = await supabase
      .from('whatsapp_broadcast_recipients')
      .select('id, phone, name, attempts')
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

      let outcome: { status: 'sent' | 'failed' | 'skipped'; error?: string; waMessageId?: string };
      try {
        outcome = await processRecipient(supabase, payload, graph, user.id, recipient);
      } catch (e) {
        outcome = { status: 'failed', error: formatError(e) };
      }

      await supabase
        .from('whatsapp_broadcast_recipients')
        .update({
          status: outcome.status,
          error_message: outcome.error ?? null,
          wa_message_id: outcome.waMessageId ?? null,
          attempts: (recipient.attempts ?? 0) + 1,
          processed_at: new Date().toISOString(),
        })
        .eq('id', recipient.id);

      processed += 1;

      // Pausa solo entre envíos reales (no en omitidos) para respetar el rate limit.
      if (outcome.status !== 'skipped' && i < chunk.length - 1) await sleep(BATCH_DELAY_MS);
    }

    // ── Refrescar el job con conteos reales y estado ─────────────────────────
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
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

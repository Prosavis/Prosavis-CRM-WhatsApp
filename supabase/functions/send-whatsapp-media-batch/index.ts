import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  assertMetaSendEnabled,
  BATCH_ALLOWED_MEDIA,
  formatError,
  MAX_BATCH_ATTACHMENTS,
  MAX_BATCH_BYTES,
  sendWhatsAppMediaOutbound,
  type MediaType,
} from '../_shared/whatsappOutbound.ts';
import { getStableKeyFromRecipient } from '../_shared/whatsappIdentity.ts';

interface BatchAttachment {
  clientAttachmentId: string;
  mediaType: MediaType;
  mediaUrl: string;
  storagePath?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

interface BatchResultItem {
  index: number;
  clientAttachmentId?: string;
  success: boolean;
  waMessageId?: string;
  logId?: string;
  error?: string;
}

function summarize(results: BatchResultItem[]) {
  const sent = results.filter((r) => r.success).length;
  const failed = results.length - sent;
  const status = sent === results.length
    ? 'completed'
    : sent > 0
      ? 'partial_failed'
      : 'failed';
  return { sent, failed, status: status as 'completed' | 'partial_failed' | 'failed' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const to = String(body.to ?? '').trim();
    const clientBatchId = String(body.clientBatchId ?? '').trim();
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;
    const caption = body.caption ? String(body.caption).trim() : undefined;
    const replyToWaMessageId = body.replyToWaMessageId
      ? String(body.replyToWaMessageId).trim()
      : undefined;
    const attachments = (body.attachments ?? []) as BatchAttachment[];

    if (!to) return jsonResponse({ error: 'Se requiere destinatario (to).' }, 400);
    if (!clientBatchId) return jsonResponse({ error: 'Se requiere clientBatchId.' }, 400);
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return jsonResponse({ error: 'Se requiere al menos un adjunto.' }, 400);
    }
    if (attachments.length > MAX_BATCH_ATTACHMENTS) {
      return jsonResponse({ error: `Máximo ${MAX_BATCH_ATTACHMENTS} adjuntos por lote.` }, 400);
    }

    let totalBytes = 0;
    for (const [index, attachment] of attachments.entries()) {
      if (!attachment?.clientAttachmentId) {
        return jsonResponse({ error: `Adjunto ${index + 1}: falta clientAttachmentId.` }, 400);
      }
      if (!attachment.mediaUrl) {
        return jsonResponse({ error: `Adjunto ${index + 1}: falta mediaUrl.` }, 400);
      }
      if (!BATCH_ALLOWED_MEDIA.includes(attachment.mediaType)) {
        return jsonResponse({ error: `Adjunto ${index + 1}: tipo no soportado.` }, 400);
      }
      totalBytes += attachment.sizeBytes || 0;
    }
    if (totalBytes > MAX_BATCH_BYTES) {
      return jsonResponse({ error: 'El lote supera 100 MB.' }, 400);
    }

    const { data: existingBatch } = await supabase
      .from('whatsapp_outbound_batches')
      .select('*')
      .eq('client_batch_id', clientBatchId)
      .maybeSingle();

    if (existingBatch) {
      return jsonResponse({
        success: existingBatch.status === 'completed',
        batchId: clientBatchId,
        status: existingBatch.status,
        sent: existingBatch.sent,
        failed: existingBatch.failed,
        results: existingBatch.results ?? [],
        reused: true,
      });
    }

    try {
      assertMetaSendEnabled();
    } catch (error) {
      return jsonResponse({ error: String(error) }, 503);
    }

    await supabase.from('whatsapp_outbound_batches').insert({
      client_batch_id: clientBatchId,
      status: 'processing',
      to_key: getStableKeyFromRecipient(to),
      phone_number_id: phoneNumberId ?? null,
      total: attachments.length,
      sent: 0,
      failed: 0,
      results: [],
      created_by: user.id,
    });

    const results: BatchResultItem[] = [];

    for (const [index, attachment] of attachments.entries()) {
      try {
        const result = await sendWhatsAppMediaOutbound(supabase, {
          to,
          mediaType: attachment.mediaType,
          mediaUrl: attachment.mediaUrl,
          caption: index === 0 ? caption : undefined,
          filename: attachment.filename,
          replyToWaMessageId: index === 0 ? replyToWaMessageId : undefined,
          batchId: clientBatchId,
          batchIndex: index,
          clientAttachmentId: attachment.clientAttachmentId,
          storagePath: attachment.storagePath,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          phoneNumberId,
          agentUid: user.id,
        });

        results.push({
          index,
          clientAttachmentId: attachment.clientAttachmentId,
          success: result.success,
          waMessageId: result.waMessageId,
          logId: result.messageId,
          ...(result.error ? { error: result.error } : {}),
        });
      } catch (error) {
        results.push({
          index,
          clientAttachmentId: attachment.clientAttachmentId,
          success: false,
          error: formatError(error),
        });
      }

      const partial = summarize(results);
      await supabase.from('whatsapp_outbound_batches').update({
        status: 'processing',
        sent: partial.sent,
        failed: partial.failed,
        results,
      }).eq('client_batch_id', clientBatchId);
    }

    const summary = summarize(results);
    await supabase.from('whatsapp_outbound_batches').update({
      status: summary.status,
      sent: summary.sent,
      failed: summary.failed,
      results,
      completed_at: new Date().toISOString(),
    }).eq('client_batch_id', clientBatchId);

    return jsonResponse({
      success: summary.status === 'completed',
      batchId: clientBatchId,
      status: summary.status,
      sent: summary.sent,
      failed: summary.failed,
      results,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('send-whatsapp-media-batch failed', error);
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

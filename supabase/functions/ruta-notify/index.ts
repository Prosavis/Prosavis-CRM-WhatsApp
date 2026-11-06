/**
 * ruta-notify
 *
 * Ruta Prosavis: Firebase llama aquí (x-api-key = RUTA_NOTIFY_API_KEY) y esta Edge envía por la
 * línea 312 con sendToMeta. Firebase nunca llama a Graph. La 311 (Coex) no se toca.
 * Cada envío queda en whatsapp_message_log / whatsapp_conversations para que se vea en el inbox.
 *
 * Contrato: prosavis-firebase/docs/context/ruta-prosavis.md
 */

import { jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { assertBotOnlyAutomation, envString } from '../_shared/whatsappLines.ts';
import {
  assertMetaSendEnabled,
  ensureConversation,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  outboundConversationKey,
  persistOutboundLog,
  rejectIfSessionWindowClosed,
  resolveOutboundMediaForMeta,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import {
  authorizeRutaNotify,
  buildRutaNotifyPayload,
  parseRutaNotifyRequest,
  rutaNotifyAuthStatus,
} from '../_shared/rutaNotify.ts';

function fail(error: string, status: number): Response {
  return jsonResponse({ ok: false, error }, status);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('Método no permitido.', 405);

  const auth = await authorizeRutaNotify(req.headers.get('x-api-key'), envString('RUTA_NOTIFY_API_KEY'));
  if (auth === 'missing_env') return fail('RUTA_NOTIFY_API_KEY no configurada.', rutaNotifyAuthStatus(auth));
  if (auth === 'unauthorized') return fail('No autorizado.', rutaNotifyAuthStatus(auth));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('JSON inválido.', 400);
  }
  const parsed = parseRutaNotifyRequest(body);
  if (!parsed.ok) return fail(parsed.error, 400);
  const request = parsed.value;
  const plan = buildRutaNotifyPayload(request);

  try {
    try {
      assertMetaSendEnabled();
    } catch (error) {
      return fail(formatError(error), 503);
    }

    const graph = getGraphCredentials();
    assertBotOnlyAutomation(graph.phoneNumberId);
    const supabase = getServiceClient();

    if (await isRecipientBlocked(supabase, plan.to)) return fail('recipient_blocked', 403);

    const stableKey = outboundConversationKey(plan.to, graph.phoneNumberId);
    try {
      await ensureConversation(supabase, stableKey, plan.to, graph.phoneNumberId);
    } catch (error) {
      console.error('[ruta-notify] ensureConversation failed', formatError(error));
    }

    if (plan.requiresSessionWindow) {
      const blocked = await rejectIfSessionWindowClosed(supabase, stableKey);
      if (blocked) return fail(blocked.error ?? 'Ventana de 24 h cerrada.', 409);
    }

    let send = plan.send;
    if (request.kind === 'image') {
      // Meta falla seguido descargando weblinks firmados (131053): se sube el binario y se manda por id.
      try {
        const { mediaId } = await resolveOutboundMediaForMeta(supabase, {
          mediaType: 'image',
          mediaUrl: request.link,
          phoneNumberId: graph.phoneNumberId,
          accessToken: graph.accessToken,
        });
        if (mediaId) send = { ...send, mediaId, mediaUrl: undefined };
      } catch (error) {
        console.warn('[ruta-notify] media upload failed, sending by link', formatError(error));
      }
    }

    const metaResult = await sendToMeta({
      ...send,
      to: plan.to,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
    });

    // Si el log falla después de enviar, no devolvemos 500: Firebase reintentaría y duplicaría el mensaje.
    try {
      const persisted = await persistOutboundLog(
        supabase,
        {
          conversation_stable_key: stableKey,
          recipient_phone: plan.to,
          recipient_bsuid: null,
          direction: 'outbound',
          sender_type: 'system',
          message_body: plan.displayBody,
          status: metaResult.status,
          wa_message_id: metaResult.waMessageId,
          campaign_type: 'OTHER',
          phone_number_id: graph.phoneNumberId,
          error_message: metaResult.errorMessage ?? null,
          ...plan.logFields,
          raw_payload: {
            ...metaResult.payload,
            source: 'ruta_notify',
            ruta_kind: request.kind,
          },
        },
        null,
        'system',
      );
      await updateConversationPreview(
        supabase,
        stableKey,
        plan.displayBody,
        metaResult.status,
        persisted.createdAt ?? new Date().toISOString(),
      );
    } catch (error) {
      console.error('[ruta-notify] inbox log failed', formatError(error));
    }

    if (metaResult.status === 'failed' || !metaResult.waMessageId) {
      return fail(metaResult.errorMessage ?? 'Meta no aceptó el mensaje.', 502);
    }
    return jsonResponse({ ok: true, messageId: metaResult.waMessageId });
  } catch (error) {
    return fail(formatError(error), 500);
  }
});

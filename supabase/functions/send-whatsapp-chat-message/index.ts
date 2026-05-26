import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  assertMetaSendEnabled,
  formatError,
  metaErrorMessage,
  sendTextOutbound,
  sendWhatsAppMediaOutbound,
  type MediaType,
} from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const rawTo = String(body.conversationStableKey ?? body.to ?? '').trim();
    const to = rawTo;
    const text = String(body.messageBody ?? body.text ?? '').trim();
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : '';
    const mediaType = body.mediaType ? String(body.mediaType).trim() as MediaType : undefined;
    const caption = body.caption ? String(body.caption).trim() : undefined;
    const filename = body.filename ? String(body.filename).trim() : undefined;
    const replyToWaMessageId = body.replyToWaMessageId
      ? String(body.replyToWaMessageId).trim()
      : undefined;
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;
    const storagePath = body.storagePath ? String(body.storagePath).trim() : undefined;
    const mimeType = body.mimeType ? String(body.mimeType).trim() : undefined;
    const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : undefined;
    const isAnimatedSticker = body.isAnimatedSticker === true;

    if (!to) return jsonResponse({ error: 'Se requiere destinatario (to).' }, 400);

    const isMedia = Boolean(mediaUrl && mediaType);
    if (!isMedia && !text) {
      return jsonResponse({ error: 'Se requiere text o mediaUrl con mediaType.' }, 400);
    }

    try {
      assertMetaSendEnabled();
    } catch (error) {
      return jsonResponse({ error: String(error) }, 503);
    }

    const result = isMedia
      ? await sendWhatsAppMediaOutbound(supabase, {
          to,
          mediaType: mediaType!,
          mediaUrl,
          caption,
          filename,
          replyToWaMessageId,
          phoneNumberId,
          storagePath,
          mimeType,
          sizeBytes,
          isAnimatedSticker,
          agentUid: user.id,
        })
      : await sendTextOutbound(supabase, {
          to,
          text,
          phoneNumberId,
          replyToWaMessageId,
          agentUid: user.id,
        });

    return jsonResponse({
      success: result.success,
      waMessageId: result.waMessageId,
      messageId: result.messageId,
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('send-whatsapp-chat-message failed', error);
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

interface MetaSendResult {
  status: 'sent' | 'failed';
  waMessageId: string | null;
  payload: Record<string, unknown>;
  logMessageBody: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function formatError(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value) => typeof value === 'string' && value.length > 0);
    if (parts.length) return parts.join(' — ');
  }
  return String(error);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23503'
  );
}

function normalizeWaMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function metaErrorMessage(payload: Record<string, unknown>): string | undefined {
  const metaResponse = payload.metaResponse as { error?: { message?: string } } | undefined;
  return metaResponse?.error?.message;
}

async function sendToMeta(params: {
  recipientPhone: string;
  phoneNumberId: string;
  messageBody?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  caption?: string;
  filename?: string;
  replyToWaMessageId?: string;
}): Promise<MetaSendResult> {
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const graphVersion = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v21.0';

  if (!accessToken) {
    throw new Error('Falta WHATSAPP_ACCESS_TOKEN para envio real.');
  }
  if (!params.phoneNumberId) {
    throw new Error('Falta WHATSAPP_PHONE_NUMBER_ID para envio real.');
  }

  const to = normalizePhone(params.recipientPhone);
  let requestBody: Record<string, unknown>;

  if (params.mediaUrl && params.mediaType) {
    const mediaPayload: Record<string, unknown> = { link: params.mediaUrl };
    if (
      params.caption &&
      (params.mediaType === 'image' ||
        params.mediaType === 'video' ||
        params.mediaType === 'document')
    ) {
      mediaPayload.caption = params.caption;
    }
    if (params.mediaType === 'document' && params.filename) {
      mediaPayload.filename = params.filename;
    }
    requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: params.mediaType,
      [params.mediaType]: mediaPayload,
    };
  } else {
    requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: params.messageBody ?? '',
      },
    };
  }

  if (params.replyToWaMessageId) {
    requestBody.context = { message_id: params.replyToWaMessageId };
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${params.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  const payload = await response.json().catch(() => ({}));
  const waMessageId = normalizeWaMessageId(
    Array.isArray(payload.messages) && payload.messages[0]?.id
      ? String(payload.messages[0].id)
      : null,
  );

  const logMessageBody = params.mediaUrl && params.mediaType
    ? params.caption || `[${params.mediaType}]`
    : (params.messageBody ?? '');

  return {
    status: response.ok && waMessageId ? 'sent' : 'failed',
    waMessageId,
    logMessageBody,
    mediaType: params.mediaType,
    mediaUrl: params.mediaUrl,
    caption: params.caption,
    filename: params.filename,
    payload: {
      metaStatus: response.status,
      metaOk: response.ok,
      metaResponse: payload,
    },
  };
}

async function ensureConversation(
  supabase: Awaited<ReturnType<typeof requireCrmAdmin>>['supabase'],
  stableKey: string,
  recipientPhone: string,
  phoneNumberId: string,
) {
  const { error } = await supabase.from('whatsapp_conversations').upsert(
    {
      stable_key: stableKey,
      phone: stableKey,
      contact_phone: recipientPhone,
      phone_number_id: phoneNumberId || null,
      state: 'active',
    },
    { onConflict: 'stable_key' },
  );
  if (error) throw error;
}

async function persistOutboundLog(
  supabase: Awaited<ReturnType<typeof requireCrmAdmin>>['supabase'],
  row: Record<string, unknown>,
  agentUid: string,
): Promise<{ messageId?: string; createdAt?: string; warning?: string }> {
  const baseRow = { ...row, agent_uid: agentUid };

  const attemptInsert = async (payload: Record<string, unknown>) =>
    supabase
      .from('whatsapp_message_log')
      .insert(payload)
      .select('id, created_at')
      .single();

  let { data: message, error: insertError } = await attemptInsert(baseRow);

  if (insertError && isForeignKeyViolation(insertError)) {
    console.warn(
      'send-whatsapp-chat-message: agent_uid FK; reintentando sin agent_uid',
      agentUid,
    );
    const fallback = { ...row, agent_uid: null };
    ({ data: message, error: insertError } = await attemptInsert(fallback));
  }

  if (insertError) {
    const waMessageId = normalizeWaMessageId(row.wa_message_id as string | null | undefined);
    if (isUniqueViolation(insertError) && waMessageId) {
      const { data: existing } = await supabase
        .from('whatsapp_message_log')
        .select('id, created_at')
        .eq('wa_message_id', waMessageId)
        .maybeSingle();
      if (existing) {
        return { messageId: existing.id, createdAt: existing.created_at };
      }
    }
    throw insertError;
  }

  return {
    messageId: message?.id,
    createdAt: message?.created_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const rawTo = String(body.conversationStableKey ?? body.to ?? '').trim();
    const stableKey = normalizePhone(rawTo) || rawTo;
    const text = String(body.messageBody ?? body.text ?? '').trim();
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : '';
    const mediaType = body.mediaType ? String(body.mediaType).trim() as MediaType : undefined;
    const caption = body.caption ? String(body.caption).trim() : undefined;
    const filename = body.filename ? String(body.filename).trim() : undefined;
    const replyToWaMessageId = body.replyToWaMessageId
      ? String(body.replyToWaMessageId).trim()
      : undefined;

    const recipientPhone = normalizePhone(
      String(body.recipientPhone ?? body.to ?? stableKey).trim(),
    ) || stableKey;
    const phoneNumberId = String(
      body.phoneNumberId ?? Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    ).trim();
    const metaSendEnabled = Deno.env.get('ENABLE_META_SEND')?.trim().toLowerCase() === 'true';
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim();

    if (!stableKey) {
      return jsonResponse({ error: 'Se requiere destinatario (to).' }, 400);
    }

    const isMedia = Boolean(mediaUrl && mediaType);
    if (!isMedia && !text) {
      return jsonResponse({ error: 'Se requiere text o mediaUrl con mediaType.' }, 400);
    }

    if (!metaSendEnabled) {
      return jsonResponse(
        {
          error:
            'Envio Meta desactivado. Configure ENABLE_META_SEND=true y secrets validos.',
        },
        503,
      );
    }

    if (!accessToken || !phoneNumberId) {
      return jsonResponse(
        {
          error:
            'Credenciales WhatsApp incompletas en Edge Secrets (WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID).',
        },
        503,
      );
    }

    await ensureConversation(supabase, stableKey, recipientPhone, phoneNumberId);

    const metaResult = await sendToMeta({
      recipientPhone,
      phoneNumberId,
      messageBody: text || undefined,
      mediaUrl: isMedia ? mediaUrl : undefined,
      mediaType: isMedia ? mediaType : undefined,
      caption,
      filename,
      replyToWaMessageId,
    });

    const metaErrorText = metaErrorMessage(metaResult.payload);
    const insertRow = {
      conversation_stable_key: stableKey,
      recipient_phone: recipientPhone,
      direction: 'outbound' as const,
      sender_type: 'agent' as const,
      message_body: metaResult.logMessageBody,
      media_type: metaResult.mediaType ?? null,
      media_url: metaResult.mediaUrl ?? null,
      caption: metaResult.caption ?? null,
      filename: metaResult.filename ?? null,
      status: metaResult.status,
      wa_message_id: metaResult.waMessageId,
      reply_to_wa_message_id: replyToWaMessageId ?? null,
      campaign_type: 'OTHER',
      phone_number_id: phoneNumberId || null,
      error_message: metaErrorText ?? null,
      raw_payload: metaResult.payload,
    };

    const persisted = await persistOutboundLog(supabase, insertRow, user.id);
    const messageId = persisted.messageId;
    const createdAt = persisted.createdAt ?? new Date().toISOString();

    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_text: metaResult.logMessageBody,
        last_message_at: createdAt,
        last_message_direction: 'outbound',
        last_message_outbound_status: metaResult.status,
        unread_count: 0,
      })
      .eq('stable_key', stableKey);

    if (updateError) {
      console.error('send-whatsapp-chat-message: update conversation failed', updateError);
    }

    const metaError =
      metaResult.status === 'failed'
        ? (metaErrorText ?? 'Error al enviar con Meta.')
        : undefined;

    return jsonResponse({
      success: metaResult.status === 'sent',
      waMessageId: metaResult.waMessageId ?? undefined,
      messageId,
      ...(metaError ? { error: metaError } : {}),
      ...(persisted.warning ? { warning: persisted.warning } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('send-whatsapp-chat-message failed', error);
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

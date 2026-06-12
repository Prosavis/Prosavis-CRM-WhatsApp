import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { UNARCHIVE_CONVERSATION_PATCH } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Autenticación vía API key compartida ──
  const apiKey = Deno.env.get('CRM_WRITE_KEY')?.trim();
  const providedKey = req.headers.get('x-api-key')?.trim();
  if (!apiKey || providedKey !== apiKey) {
    return jsonResponse({ error: 'No autorizado.' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      recipientPhone,
      waMessageId,
      displayMessageBody,
      templateName,
      phoneNumberId,
    } = body;

    if (!recipientPhone || !waMessageId) {
      return jsonResponse(
        { error: 'Faltan campos requeridos: recipientPhone, waMessageId' },
        400,
      );
    }

    const supabase = getServiceClient();

    // Normalizar el teléfono como stable_key
    const stableKey = recipientPhone.replace(/[^0-9]/g, '');
    const defaultPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')?.trim() ?? '';

    // ── 1. Upsert conversación (crear si no existe) ──
    const { error: convError } = await supabase
      .from('whatsapp_conversations')
      .upsert(
        {
          stable_key: stableKey,
          phone: stableKey,
          contact_phone: recipientPhone,
          phone_number_id: phoneNumberId || defaultPhoneNumberId,
          state: 'active',
        },
        { onConflict: 'stable_key' },
      );
    if (convError) {
      console.error('Error upserting conversation', convError);
      return jsonResponse({ error: `Error de conversación: ${convError.message}` }, 500);
    }

    // ── 2. Insertar en whatsapp_message_log ──
    const logRow: Record<string, unknown> = {
      conversation_stable_key: stableKey,
      recipient_phone: recipientPhone,
      direction: 'outbound',
      sender_type: 'system',
      message_body: displayMessageBody || templateName || '',
      status: 'sent',
      wa_message_id: waMessageId,
      template_name: templateName || null,
      phone_number_id: phoneNumberId || defaultPhoneNumberId,
      campaign_type: 'OTHER',
      raw_payload: {
        source: 'firebase_userconsole',
        template_name: templateName || null,
      },
    };

    const { data: message, error: logError } = await supabase
      .from('whatsapp_message_log')
      .insert(logRow)
      .select('id, created_at')
      .single();

    if (logError) {
      console.error('Error inserting message log', logError);
      return jsonResponse({ error: `Error al insertar en log: ${logError.message}` }, 500);
    }

    // ── 3. Actualizar vista previa de la conversación ──
    const createdAt = message?.created_at ?? new Date().toISOString();
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_text: displayMessageBody || templateName || '',
        last_message_at: createdAt,
        last_message_direction: 'outbound',
        last_message_outbound_status: 'sent',
        unread_count: 0,
        ...UNARCHIVE_CONVERSATION_PATCH,
      })
      .eq('stable_key', stableKey);

    return jsonResponse({
      success: true,
      messageId: message?.id,
      createdAt,
    });
  } catch (error) {
    console.error('log-whatsapp-outbound failed', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      500,
    );
  }
});

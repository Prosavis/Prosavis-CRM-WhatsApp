import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { verifyAppointmentOwnership, verifyFirebaseToken } from '../_shared/firebaseAuth.ts';
import {
  assertMetaSendEnabled,
  formatError,
  getGraphCredentials,
  isRecipientBlocked,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from '../_shared/whatsappOutbound.ts';
import {
  getStableKeyFromRecipient,
  normalizePhone,
  resolveRecipient,
} from '../_shared/whatsappIdentity.ts';

const DEFAULT_TIMEZONE = 'America/Bogota';
const TEMPLATE_NAME = 'confirmacion_cita';
const TEMPLATE_LANGUAGE = 'es_CO';

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: DEFAULT_TIMEZONE,
  });
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DEFAULT_TIMEZONE,
  });
}

function formatCurrencyCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildPaymentText(totalAmount: number, paymentStatus: string): string {
  const amount = formatCurrencyCop(totalAmount);
  const status = (paymentStatus || '').trim().toUpperCase();
  if (status === 'PAGO_PENDIENTE' || status === 'PENDING') {
    return `${amount} - Pendiente`;
  }
  return `${amount} - Pagado`;
}

function validateE164ishPhone(input: string): string {
  const normalized = normalizePhone(input);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Número de teléfono inválido (use formato internacional, ej. 573001234567).');
  }
  return normalized;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Autenticación: ID token de Firebase (UserConsole).
    const { uid, idToken } = await verifyFirebaseToken(req);

    const body = await req.json().catch(() => ({}));
    const appointmentId = body.appointmentId ? String(body.appointmentId).trim() : '';
    const recipientPhone = body.recipientPhone ? String(body.recipientPhone).trim() : '';
    const clientName = body.clientName ? String(body.clientName).trim() : '';
    const scheduledDate = body.scheduledDate ? String(body.scheduledDate).trim() : '';
    const address = body.address ? String(body.address).trim() : '';
    const totalAmount = Number(body.totalAmount ?? 0);
    const paymentStatus = body.paymentStatus ? String(body.paymentStatus).trim() : '';

    if (!appointmentId || !recipientPhone || !clientName || !scheduledDate) {
      return jsonResponse(
        { error: 'Faltan campos requeridos: appointmentId, recipientPhone, clientName, scheduledDate.' },
        400,
      );
    }

    // 2. Propiedad de la cita: las Security Rules de Firestore validan el ownership.
    await verifyAppointmentOwnership(idToken, appointmentId);

    // 3. Envío Meta habilitado.
    try {
      assertMetaSendEnabled();
    } catch (error) {
      return jsonResponse({ error: String(error) }, 503);
    }

    const phone = validateE164ishPhone(recipientPhone);
    const supabase = getServiceClient();
    if (await isRecipientBlocked(supabase, phone)) {
      return jsonResponse({ error: 'recipient_blocked' }, 400);
    }

    // 4. Construir parámetros de la plantilla (mismo orden que el flujo legacy).
    const dateStr = formatDate(scheduledDate);
    const timeStr = formatTime(scheduledDate);
    const paymentText = buildPaymentText(totalAmount, paymentStatus);
    const displayAddress = address || '—';
    const displayMessageBody = `Confirmación: ${clientName} - ${dateStr} ${timeStr}`;

    const components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: clientName },
          { type: 'text', text: dateStr },
          { type: 'text', text: timeStr },
          { type: 'text', text: displayAddress },
          { type: 'text', text: paymentText },
        ],
      },
    ];

    // 5. Enviar vía la WABA central y registrar en el log del CRM.
    const graph = getGraphCredentials();
    const metaResult = await sendToMeta({
      to: phone,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName: TEMPLATE_NAME,
      templateLanguage: TEMPLATE_LANGUAGE,
      templateComponents: components,
      messageBody: displayMessageBody,
      requirePhone: true,
    });

    const stableKey = getStableKeyFromRecipient(phone);
    const recipient = resolveRecipient(phone);
    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: normalizePhone(phone),
        recipient_bsuid: recipient.bsuid ?? null,
        direction: 'outbound',
        sender_type: 'system',
        message_body: displayMessageBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: TEMPLATE_NAME,
        campaign_type: 'OTHER',
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: {
          ...metaResult.payload,
          source: 'firebase_userconsole',
          appointment_id: appointmentId,
          firebase_uid: uid,
        },
      },
      uid,
    );

    const createdAt = persisted.createdAt ?? new Date().toISOString();
    await updateConversationPreview(
      supabase,
      stableKey,
      displayMessageBody,
      metaResult.status,
      createdAt,
    );

    if (metaResult.status === 'failed') {
      return jsonResponse(
        { error: metaResult.errorMessage ?? 'No se pudo enviar la confirmación.' },
        412,
      );
    }

    return jsonResponse({ success: true, waMessageId: metaResult.waMessageId });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

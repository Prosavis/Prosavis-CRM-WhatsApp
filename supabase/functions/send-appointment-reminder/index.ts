/**
 * send-appointment-reminder
 *
 * Envía recordatorios WhatsApp vía Meta para citas de limpieza.
 * - "recordatorio_cita_24h" → al cliente (24h antes)
 * - "recordatorio_profesional_24h" → al profesional/cleaner (24h antes)
 *
 * Se autentica vía API key (server-to-server desde Firebase).
 * Los mensajes se registran en whatsapp_message_log y actualizan
 * whatsapp_conversations para que aparezcan en el inbox del CRM.
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
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

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────

interface AppointmentData {
  clientName: string;
  professionalName: string;
  scheduledDate: string; // ISO string
  address: string;
  durationMinutes: number;
  totalAmount: number;
  paymentStatus: string;
  appointmentId: string;
  /** Opcional: link de Google Maps */
  mapsLink?: string;
}

interface ReminderPayload {
  recipientPhone: string;
  recipientType: 'client' | 'professional';
  appointmentData: AppointmentData;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

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

function formatSchedule(isoString: string): string {
  return `${formatDate(isoString)} — ${formatTime(isoString)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return `${hours} ${hours === 1 ? 'hora' : 'horas'} ${mins} minutos`;
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
  if (status === 'PAGO_PENDIENTE' || status === 'PENDING' || status === '') {
    return `${amount} - Pendiente`;
  }
  return `${amount} - Pagado`;
}

/**
 * Construye el texto de advertencia de pago para el cliente.
 * Si el pago está pendiente, muestra alerta; si está pagado, mensaje positivo.
 */
function buildPaymentWarning(totalAmount: number, paymentStatus: string): string {
  const status = (paymentStatus || '').trim().toUpperCase();
  if (status === 'PAGO_PENDIENTE' || status === 'PENDING' || status === '') {
    return '⚠️ Tu pago aún está pendiente. Para asegurar tu cita, te invitamos a realizar el pago lo antes posible.';
  }
  return '✅ Tu pago ya está confirmado. Gracias por confiar en Prosavis.';
}

/**
 * Valida formato E.164
 */
function validateE164ishPhone(input: string): string {
  const normalized = normalizePhone(input);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Número de teléfono inválido (use formato internacional, ej. 573001234567).');
  }
  return normalized;
}

/**
 * Asegura que la conversación exista en whatsapp_conversations antes de insertar el log.
 */
async function ensureConversationExists(
  supabase: ReturnType<typeof getServiceClient>,
  stableKey: string,
  phone: string,
  contactName?: string,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .upsert(
      {
        stable_key: stableKey,
        phone,
        contact_name: contactName || phone,
        contact_phone: phone,
        state: 'active',
        unread_count: 0,
        tag_ids: [],
        is_archived: false,
        is_pinned: false,
        crm_force_unread: false,
        metadata: {},
      },
      { onConflict: 'stable_key', ignoreDuplicates: true },
    );
  if (error) {
    if (error.code === '23505') {
      // Unique violation = race condition, otro proceso creó la conversación — ok
      return;
    }
    console.error('ensureConversationExists error', JSON.stringify({ code: error.code, message: error.message, details: error.details }));
    // No lanzamos error — la función principal puede continuar e intentar el log
  }
}

/**
 * Construye el display body para el log, extrayendo los texts de los componentes.
 */
function buildDisplayBody(
  templateName: string,
  recipientType: 'client' | 'professional',
  appointmentData: AppointmentData,
  mapsLink?: string,
): string {
  if (recipientType === 'client') {
    return (
      `🧹 Recordatorio de servicio — ${appointmentData.clientName}\n` +
      `Tu profesional: ${appointmentData.professionalName}\n` +
      `Fecha: ${formatSchedule(appointmentData.scheduledDate)}\n` +
      `Dirección: ${appointmentData.address || '—'}\n` +
      `Duración: ${formatDuration(appointmentData.durationMinutes)}\n` +
      `Valor: ${buildPaymentText(appointmentData.totalAmount, appointmentData.paymentStatus)}`
    );
  }
  // Professional
  const mapsText = mapsLink ? `\n📍 Maps: ${mapsLink}` : '';
  return (
    `🧹 Recordatorio de servicio mañana\n` +
    `Cliente: ${appointmentData.clientName}\n` +
    `Dirección: ${appointmentData.address || '—'}\n` +
    `Horario: ${formatSchedule(appointmentData.scheduledDate)}\n` +
    `Duración: ${formatDuration(appointmentData.durationMinutes)}` +
    mapsText
  );
}

// ──────────────────────────────────────────────
// Handler principal
// ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── 1. Autenticación server-to-server vía API key ──
    const apiKey = req.headers.get('x-api-key')?.trim();
    const expectedKey = Deno.env.get('REMINDER_API_KEY')?.trim();
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    // ── 2. Validar payload ──
    const body = await req.json().catch(() => ({})) as ReminderPayload;
    const { recipientPhone, recipientType, appointmentData } = body;

    if (!recipientPhone || !recipientType || !appointmentData) {
      return jsonResponse(
        { error: 'Faltan campos requeridos: recipientPhone, recipientType, appointmentData.' },
        400,
      );
    }

    if (!['client', 'professional'].includes(recipientType)) {
      return jsonResponse(
        { error: 'recipientType debe ser "client" o "professional".' },
        400,
      );
    }

    if (!appointmentData.clientName || !appointmentData.scheduledDate) {
      return jsonResponse(
        { error: 'appointmentData requiere al menos clientName y scheduledDate.' },
        400,
      );
    }

    // ── 3. Verificar envío habilitado ──
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

    // ── 4. Elegir template y construir componentes ──
    const TEMPLATE_CLIENT = 'recordatorio_cita_24h';
    const TEMPLATE_PROFESSIONAL = 'recordatorio_profesional_24h';
    const TEMPLATE_LANGUAGE = 'es_CO';

    const templateName = recipientType === 'client' ? TEMPLATE_CLIENT : TEMPLATE_PROFESSIONAL;
    const mapsLink = appointmentData.mapsLink || '';

    let components: Array<Record<string, unknown>>;

    if (recipientType === 'client') {
      // recordatorio_cita_24h:
      // {{1}} clientName
      // {{2}} professionalName
      // {{3}} fecha completa (formato local)
      // {{4}} dirección
      // {{5}} duración
      // {{6}} valor + estado de pago
      // {{7}} advertencia de pago
      components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: appointmentData.clientName },
            { type: 'text', text: appointmentData.professionalName || 'Profesional' },
            { type: 'text', text: formatSchedule(appointmentData.scheduledDate) },
            { type: 'text', text: appointmentData.address || '—' },
            { type: 'text', text: formatDuration(appointmentData.durationMinutes) },
            {
              type: 'text',
              text: buildPaymentText(appointmentData.totalAmount, appointmentData.paymentStatus),
            },
            {
              type: 'text',
              text: buildPaymentWarning(appointmentData.totalAmount, appointmentData.paymentStatus),
            },
          ],
        },
      ];
    } else {
      // recordatorio_profesional_24h:
      // {{1}} clientName
      // {{2}} dirección
      // {{3}} horario (fecha + hora)
      // {{4}} duración
      const scheduleText = `${formatDate(appointmentData.scheduledDate)} — ${formatTime(appointmentData.scheduledDate)}`;
      const addressText = mapsLink
        ? `${appointmentData.address || '—'}\n📍 Google Maps: ${mapsLink}`
        : (appointmentData.address || '—');

      components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: appointmentData.clientName },
            { type: 'text', text: addressText },
            { type: 'text', text: scheduleText },
            { type: 'text', text: formatDuration(appointmentData.durationMinutes) },
          ],
        },
      ];
    }

    // ── 5. Enviar vía Meta ──
    const displayBody = buildDisplayBody(templateName, recipientType, appointmentData, mapsLink);
    const graph = getGraphCredentials();

    const metaResult = await sendToMeta({
      to: phone,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName,
      templateLanguage: TEMPLATE_LANGUAGE,
      templateComponents: components,
      messageBody: displayBody,
      requirePhone: true,
    });

    // ── 6. Log en Supabase → CRM inbox ──
    const stableKey = getStableKeyFromRecipient(phone);
    const recipient = resolveRecipient(phone);

    // Asegurar que la conversación exista antes de insertar el log
    await ensureConversationExists(supabase, stableKey, phone, appointmentData.clientName);

    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: normalizePhone(phone),
        recipient_bsuid: recipient.bsuid ?? null,
        direction: 'outbound',
        sender_type: 'system',
        message_body: displayBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: templateName,
        campaign_type: 'OTHER',
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: {
          ...metaResult.payload,
          source: 'reminder_scheduler',
          recipient_type: recipientType,
          appointment_id: appointmentData.appointmentId,
        },
      },
      /* agentUid= */ null,
    );

    const createdAt = persisted.createdAt ?? new Date().toISOString();
    await updateConversationPreview(
      supabase,
      stableKey,
      displayBody,
      metaResult.status,
      createdAt,
    );

    if (metaResult.status === 'failed') {
      return jsonResponse(
        { error: metaResult.errorMessage ?? 'No se pudo enviar el recordatorio.' },
        412,
      );
    }

    return jsonResponse({
      success: true,
      waMessageId: metaResult.waMessageId,
      recipientType,
      templateName,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

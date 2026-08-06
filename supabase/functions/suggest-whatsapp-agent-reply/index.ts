import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  getGeminiApiKey,
  geminiGenerateJson,
} from '../_shared/geminiClient.ts';
import {
  createGeneratedInboxAiSuggestionResponse,
  createLastOutboundInboxAiSuggestionResponse,
} from '../_shared/inboxAiSuggestionResponse.ts';
import { resolveBookingPricingCheckout } from '../_shared/pricingCatalog.ts';
import {
  appendRealAvailabilityContext,
  loadRealAvailability,
  overwriteBookingAvailability,
} from '../_shared/availability.ts';
import {
  INBOX_AI_SYSTEM_INSTRUCTION,
  buildInboxAiContext,
  groundBookingClientInfo,
  groundBookingPayment,
} from '../_shared/inboxAiContext.ts';

const MAX_EXTRA_CONTEXT_CHARS = 2000;

function normalizeExtraContext(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.length <= MAX_EXTRA_CONTEXT_CHARS ? text : `${text.slice(0, MAX_EXTRA_CONTEXT_CHARS)}…`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const stableKey = String(body.stableKey ?? '').trim();
    const forceGenerate = body.forceGenerate === true;
    const includeVoiceTranscriptions = body.includeVoiceTranscriptions === true;
    const extraContext = normalizeExtraContext(body.extraContext);

    if (!stableKey) return jsonResponse({ error: 'Se requiere stableKey.' }, 400);

    const apiKey = getGeminiApiKey();
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY no configurada.' }, 412);

    let ctx;
    try {
      ctx = await buildInboxAiContext(supabase, stableKey, { includeVoiceTranscriptions });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes('historial') || msg.includes('mensajes del cliente')) {
        return jsonResponse({ error: msg }, 404);
      }
      throw err;
    }

    if (ctx.lastTurnRole === 'bot' && !forceGenerate) {
      return createLastOutboundInboxAiSuggestionResponse(ctx);
    }

    console.log(
      JSON.stringify({
        scope: 'suggest-whatsapp-agent-reply',
        event: 'context-built',
        historyMeta: ctx.historyMeta,
        conversationTagCount: ctx.conversationTags.length,
        hasDirectory: Boolean(ctx.directory),
        appointmentCount: ctx.appointmentCount,
        listedAppointments: ctx.appointments.length,
        propertyPattern: ctx.propertySummary.pattern,
        uniqueProperties: ctx.propertySummary.uniquePropertyCount,
      }),
    );

    // ─── Booking Context ───
    const inferredBookingContext = await geminiGenerateJson<Record<string, unknown>>({
      apiKey,
      prompt:
        'Analiza esta conversación de WhatsApp de Prosavis (limpieza en Colombia) y responde SOLO JSON con ' +
        'stage, collectedData {date,time,duration,address,addressSource}, missingData[], availableSlots[], ' +
        'paymentStatus, paymentAmount, wantsKit, clientInfo {name,phone,email,address,city,isReturningClient,userId}. ' +
        'Devuelve duration en minutos usando solo una duración oficial del catálogo y wantsKit como booleano. ' +
        'No inventes availableSlots: déjalo vacío salvo que el contexto incluya disponibilidad confirmada. ' +
        'No devuelvas precios ni links de pago; esos valores se resuelven en código. ' +
        'Usa el perfil CRM y citas como fuente de verdad cuando existan; no inventes citas. ' +
        'SEGURIDAD: si el cliente dice que a la hora H se va / no habrá nadie, pon collectedData.time una hora ANTES ' +
        '(p. ej. se van a las 08:00 → time "07:00"), nunca H exacta cuando la casa quedaría sola. ' +
        `Teléfono cliente: ${ctx.phone}\n\n${ctx.formattedBlock}`,
    }).catch(() => ({}));

    const groundedPaymentContext = groundBookingPayment(inferredBookingContext, ctx);
    const {
      bookingContext: pricedBookingContext,
      wompiCheckoutUrl,
      wompiPaymentReference,
      wompiAmountCOP,
    } = resolveBookingPricingCheckout(groundedPaymentContext, ctx.phone);
    const groundedBookingContext = groundBookingClientInfo(pricedBookingContext, ctx);
    const availableSlots = await loadRealAvailability(
      groundedBookingContext.collectedData.duration,
    );
    const bookingContext = overwriteBookingAvailability(
      groundedBookingContext,
      availableSlots,
    );
    const groundedContext = appendRealAvailabilityContext(
      ctx.formattedBlock,
      availableSlots,
    );

    // ─── Generar sugerencia de respuesta ───
    return await createGeneratedInboxAiSuggestionResponse({
      apiKey,
      systemInstruction: INBOX_AI_SYSTEM_INSTRUCTION,
      contextPrompt:
        `${extraContext ? `Contexto extra del agente:\n${extraContext}\n\n` : ''}` +
        `${groundedContext}\n\n` +
        `Contexto booking (inferido + CRM):\n${JSON.stringify(bookingContext)}` +
        (wompiCheckoutUrl ? `\nLink Wompi: ${wompiCheckoutUrl}` : ''),
      grounding: {
        bookingContext,
        appointments: ctx.appointments,
        wompiCheckoutUrl,
        wompiPaymentReference,
        wompiAmountCOP,
      },
      responseContext: ctx,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

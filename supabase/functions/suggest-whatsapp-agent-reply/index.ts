import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  getGeminiApiKey,
  geminiGenerateJson,
  geminiGenerateText,
} from '../_shared/geminiClient.ts';
import {
  getStaticCleaningWompiReference,
  getStaticCleaningWompiUrl,
} from '../_shared/wompiLinks.ts';
import {
  INBOX_AI_SYSTEM_INSTRUCTION,
  buildInboxAiContext,
  groundBookingClientInfo,
} from '../_shared/inboxAiContext.ts';

const MAX_EXTRA_CONTEXT_CHARS = 2000;

function normalizeExtraContext(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.length <= MAX_EXTRA_CONTEXT_CHARS ? text : `${text.slice(0, MAX_EXTRA_CONTEXT_CHARS)}…`;
}

function emptyBookingContext(phone: string) {
  return {
    stage: 'no_booking' as const,
    collectedData: {
      date: null,
      time: null,
      duration: null,
      address: null,
      addressSource: null,
    },
    missingData: ['fecha', 'hora', 'duración', 'dirección'],
    availableSlots: [],
    paymentStatus: 'none' as const,
    paymentAmount: null,
    calculatedPrice: null,
    clientInfo: {
      name: null,
      phone,
      email: null,
      address: null,
      city: null,
      isReturningClient: false,
      userId: null,
    },
  };
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
      return jsonResponse({
        suggestion: null,
        lastMessageIsOutbound: true,
        hint: 'El último mensaje es saliente. Usa forceGenerate para redactar igualmente.',
        historyMeta: ctx.historyMeta,
        conversationTags: ctx.conversationTags,
      });
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
    let bookingContext = await geminiGenerateJson<ReturnType<typeof emptyBookingContext>>({
      apiKey,
      prompt:
        'Analiza esta conversación de WhatsApp de Prosavis (limpieza en Colombia) y responde SOLO JSON con ' +
        'stage, collectedData {date,time,duration,address,addressSource}, missingData[], availableSlots[], ' +
        'paymentStatus, paymentAmount, calculatedPrice, clientInfo {name,phone,email,address,city,isReturningClient,userId}. ' +
        'Usa el perfil CRM y citas como fuente de verdad cuando existan; no inventes citas. ' +
        `Teléfono cliente: ${ctx.phone}\n\n${ctx.formattedBlock}`,
    }).catch(() => emptyBookingContext(ctx.phone));

    bookingContext = groundBookingClientInfo(bookingContext, ctx);

    let wompiCheckoutUrl: string | undefined;
    let wompiPaymentReference: string | undefined;
    let wompiAmountCOP: number | undefined;
    if (bookingContext.calculatedPrice && bookingContext.paymentStatus !== 'APPROVED') {
      const url = getStaticCleaningWompiUrl(bookingContext.calculatedPrice);
      if (url) {
        wompiCheckoutUrl = url;
        wompiPaymentReference = getStaticCleaningWompiReference(bookingContext.calculatedPrice) ?? undefined;
        wompiAmountCOP = bookingContext.calculatedPrice;
      }
    }

    // ─── Generar sugerencia de respuesta ───
    const suggestion = await geminiGenerateText({
      apiKey,
      systemInstruction: INBOX_AI_SYSTEM_INSTRUCTION,
      userText:
        `${extraContext ? `Contexto extra del agente:\n${extraContext}\n\n` : ''}` +
        `${ctx.formattedBlock}\n\n` +
        `Contexto booking (inferido + CRM):\n${JSON.stringify(bookingContext)}` +
        (wompiCheckoutUrl ? `\nLink Wompi: ${wompiCheckoutUrl}` : ''),
      temperature: 0.4,
    });

    return jsonResponse({
      suggestion,
      lastMessageIsOutbound: false,
      bookingContext,
      historyMeta: ctx.historyMeta,
      conversationTags: ctx.conversationTags,
      ...(wompiCheckoutUrl ? { wompiCheckoutUrl } : {}),
      ...(wompiPaymentReference ? { wompiPaymentReference } : {}),
      ...(wompiAmountCOP ? { wompiAmountCOP } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

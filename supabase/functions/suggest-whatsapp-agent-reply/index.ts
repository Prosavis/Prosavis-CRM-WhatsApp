import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  buildMergedTurns,
  getConversationHistory,
  mergedTurnsToTranscript,
} from '../_shared/conversationHistory.ts';
import { geminiGenerateJson, geminiGenerateText } from '../_shared/geminiClient.ts';
import {
  getStaticCleaningWompiReference,
  getStaticCleaningWompiUrl,
} from '../_shared/wompiLinks.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';

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

    const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY no configurada.' }, 412);

    const history = await getConversationHistory(supabase, stableKey, 40, {
      includeVoiceTranscriptions,
    });
    if (!history.length) return jsonResponse({ error: 'No se encontró historial de conversación.' }, 404);

    const merged = buildMergedTurns(history);
    if (!merged.length) return jsonResponse({ error: 'No hay mensajes del cliente en el historial.' }, 404);

    const last = merged[merged.length - 1];
    if (last.role === 'bot' && !forceGenerate) {
      return jsonResponse({
        suggestion: null,
        lastMessageIsOutbound: true,
        hint: 'El último mensaje es saliente. Usa forceGenerate para redactar igualmente.',
      });
    }

    const phone = normalizePhone(stableKey);
    const transcript = mergedTurnsToTranscript(merged);
    const bookingContext = await geminiGenerateJson<ReturnType<typeof emptyBookingContext>>({
      apiKey,
      prompt:
        'Analiza esta conversación de WhatsApp de Prosavis (limpieza en Colombia) y responde SOLO JSON con ' +
        'stage, collectedData {date,time,duration,address,addressSource}, missingData[], availableSlots[], ' +
        'paymentStatus, paymentAmount, calculatedPrice, clientInfo {name,phone,email,address,city,isReturningClient,userId}. ' +
        `Teléfono cliente: ${phone}\n\n${transcript}`,
    }).catch(() => emptyBookingContext(phone));

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

    const suggestion = await geminiGenerateText({
      apiKey,
      systemInstruction:
        'Eres un agente de ventas de Prosavis (limpieza residencial en Colombia). Responde en español, cordial y concreto. ' +
        'No inventes precios distintos a los del contexto. Si hay link de pago, menciónalo al final.',
      userText:
        `${extraContext ? `Contexto extra:\n${extraContext}\n\n` : ''}` +
        `Transcripción:\n${transcript}\n\n` +
        `Contexto booking:\n${JSON.stringify(bookingContext)}` +
        (wompiCheckoutUrl ? `\nLink Wompi: ${wompiCheckoutUrl}` : ''),
      temperature: 0.4,
    });

    return jsonResponse({
      suggestion,
      lastMessageIsOutbound: false,
      bookingContext,
      ...(wompiCheckoutUrl ? { wompiCheckoutUrl } : {}),
      ...(wompiPaymentReference ? { wompiPaymentReference } : {}),
      ...(wompiAmountCOP ? { wompiAmountCOP } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

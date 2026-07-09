import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  buildMergedTurns,
  getConversationHistory,
  mergedTurnsToTranscript,
} from '../_shared/conversationHistory.ts';
import {
  getGeminiApiKey,
  geminiGenerateJson,
} from '../_shared/geminiClient.ts';
import {
  getStaticCleaningWompiReference,
  getStaticCleaningWompiUrl,
} from '../_shared/wompiLinks.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';

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
    const includeVoiceTranscriptions = body.includeVoiceTranscriptions === true;

    if (!stableKey) return jsonResponse({ error: 'Se requiere stableKey.' }, 400);

    const apiKey = getGeminiApiKey();
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY no configurada.' }, 412);

    const history = await getConversationHistory(supabase, stableKey, 40, {
      includeVoiceTranscriptions,
    });
    if (!history.length) return jsonResponse({ error: 'No se encontró historial de conversación.' }, 404);

    const merged = buildMergedTurns(history);
    if (!merged.length) return jsonResponse({ error: 'No hay mensajes del cliente en el historial.' }, 404);

    const phone = normalizePhone(stableKey);
    const bookingContext = await geminiGenerateJson<ReturnType<typeof emptyBookingContext>>({
      apiKey,
      prompt:
        'Analiza esta conversación de WhatsApp de Prosavis y responde SOLO JSON con stage, collectedData, ' +
        'missingData, availableSlots, paymentStatus, paymentAmount, calculatedPrice, clientInfo. ' +
        `Teléfono: ${phone}\n\n${mergedTurnsToTranscript(merged)}`,
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

    return jsonResponse({
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

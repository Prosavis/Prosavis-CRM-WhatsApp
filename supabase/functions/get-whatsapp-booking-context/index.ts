import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  getGeminiApiKey,
  geminiGenerateJson,
} from '../_shared/geminiClient.ts';
import { resolveBookingPricingCheckout } from '../_shared/pricingCatalog.ts';
import {
  loadRealAvailability,
  overwriteBookingAvailability,
} from '../_shared/availability.ts';
import {
  buildInboxAiContext,
  groundBookingClientInfo,
  groundBookingPayment,
} from '../_shared/inboxAiContext.ts';

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

    const inferredBookingContext = await geminiGenerateJson<Record<string, unknown>>({
      apiKey,
      prompt:
        'Analiza esta conversación de WhatsApp de Prosavis y responde SOLO JSON con stage, collectedData, ' +
        'missingData, availableSlots, paymentStatus, paymentAmount, wantsKit, clientInfo. ' +
        'Devuelve collectedData.duration en minutos usando solo una duración oficial del catálogo y wantsKit como booleano. ' +
        'No inventes availableSlots: déjalo vacío salvo que el contexto incluya disponibilidad confirmada. ' +
        'No devuelvas precios ni links de pago; esos valores se resuelven en código. ' +
        'Usa el perfil CRM y citas Firestore como fuente de verdad cuando existan; no inventes citas. ' +
        `Teléfono: ${ctx.phone}\n\n${ctx.formattedBlock}`,
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

    return jsonResponse({
      bookingContext,
      historyMeta: ctx.historyMeta,
      conversationTags: ctx.conversationTags,
      sessionWindow: ctx.sessionWindow,
      ...(wompiCheckoutUrl ? { wompiCheckoutUrl } : {}),
      ...(wompiPaymentReference ? { wompiPaymentReference } : {}),
      ...(wompiAmountCOP ? { wompiAmountCOP } : {}),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

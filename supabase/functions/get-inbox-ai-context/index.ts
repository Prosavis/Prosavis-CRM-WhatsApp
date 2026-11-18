import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { loadRealAvailabilityDetailed } from '../_shared/availability.ts';
import { buildInboxAiContext } from '../_shared/inboxAiContext.ts';
import { pendingInboundAttachment } from '../_shared/inboxAiMediaLimits.ts';
import { resolveInboxAiOrGrokClient } from '../_shared/inboxAiContextAuth.ts';
import {
  buildInboxAiContextPack,
  parseInboxAiContextPackRequest,
} from '../_shared/inboxAiContextPack.ts';
import { STATIC_WOMPI_LINKS_BY_AMOUNT_COP } from '../_shared/wompiLinks.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await resolveInboxAiOrGrokClient(req);
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const parsed = parseInboxAiContextPackRequest(body);
    if (!parsed.ok) return jsonResponse({ error: parsed.error }, parsed.status);

    let ctx;
    try {
      ctx = await buildInboxAiContext(auth.supabase, parsed.stableKey, {
        includeVoiceTranscriptions: parsed.includeVoiceTranscriptions,
        includeImageAnalysis: parsed.includeImageAnalysis,
        includeCachedImageAnalysis: parsed.includeCachedImageAnalysis,
        includeProviderNames: true,
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes('historial') || msg.includes('mensajes del cliente')) {
        return jsonResponse({ error: msg }, 404);
      }
      throw err;
    }

    const availability = await loadRealAvailabilityDetailed(parsed.durationMinutes, {
      desiredDate: parsed.desiredDate,
    });
    const pendingQuery = await auth.supabase
      .from('whatsapp_message_log')
      .select('id, direction, media_type, mime_type, filename, media_analysis_text, voice_transcription')
      .eq('conversation_stable_key', parsed.stableKey)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(40);
    const adjuntos_sin_analizar = (pendingQuery.data ?? [])
      .map((row: {
        id?: unknown;
        direction?: unknown;
        media_type?: unknown;
        mime_type?: unknown;
        filename?: unknown;
        media_analysis_text?: unknown;
        voice_transcription?: unknown;
      }) => pendingInboundAttachment(row))
      .filter((row: ReturnType<typeof pendingInboundAttachment>) => row !== null)
      .slice(0, 12);
    return jsonResponse({
      ...buildInboxAiContextPack({
        formattedBlock: ctx.formattedBlock,
        historyMeta: ctx.historyMeta,
        conversationTags: ctx.conversationTags,
        propertySummary: ctx.propertySummary,
        sessionWindow: ctx.sessionWindow,
        greetingFirstName: ctx.greetingFirstName,
        appointmentsLoadFailed: ctx.appointmentsLoadFailed,
        lastTurnRole: ctx.lastTurnRole,
        availableSlots: availability.slots,
        availability,
        wompiLinks: STATIC_WOMPI_LINKS_BY_AMOUNT_COP,
      }),
      adjuntos_sin_analizar,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

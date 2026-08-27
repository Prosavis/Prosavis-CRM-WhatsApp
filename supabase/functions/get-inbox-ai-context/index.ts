import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { loadRealAvailability } from '../_shared/availability.ts';
import { buildInboxAiContext } from '../_shared/inboxAiContext.ts';
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
      });
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes('historial') || msg.includes('mensajes del cliente')) {
        return jsonResponse({ error: msg }, 404);
      }
      throw err;
    }

    const availableSlots = await loadRealAvailability(parsed.durationMinutes);
    return jsonResponse(buildInboxAiContextPack({
      formattedBlock: ctx.formattedBlock,
      historyMeta: ctx.historyMeta,
      conversationTags: ctx.conversationTags,
      propertySummary: ctx.propertySummary,
      sessionWindow: ctx.sessionWindow,
      greetingFirstName: ctx.greetingFirstName,
      appointmentsLoadFailed: ctx.appointmentsLoadFailed,
      lastTurnRole: ctx.lastTurnRole,
      availableSlots,
      wompiLinks: STATIC_WOMPI_LINKS_BY_AMOUNT_COP,
    }));
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

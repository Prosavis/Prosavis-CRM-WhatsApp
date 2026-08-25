import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { loadRealAvailability } from '../_shared/availability.ts';
import { buildInboxAiContext } from '../_shared/inboxAiContext.ts';
import {
  buildInboxAiContextPack,
  isInboxAiContextApiKeyValid,
  parseInboxAiContextPackRequest,
} from '../_shared/inboxAiContextPack.ts';
import { STATIC_WOMPI_LINKS_BY_AMOUNT_COP } from '../_shared/wompiLinks.ts';

async function resolveInboxAiContextClient(req: Request) {
  const providedKey = req.headers.get('x-api-key');
  if (providedKey?.trim()) {
    const expected = Deno.env.get('GROK_INBOX_AI_CONTEXT_KEY')?.trim() ?? '';
    if (!isInboxAiContextApiKeyValid(providedKey, expected)) {
      return { error: jsonResponse({ error: 'x-api-key inválida.' }, 401) };
    }
    return { supabase: getServiceClient() };
  }

  try {
    const admin = await requireCrmAdmin(req);
    return { supabase: admin.supabase };
  } catch (error) {
    if (error instanceof Response) return { error };
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await resolveInboxAiContextClient(req);
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const parsed = parseInboxAiContextPackRequest(body);
    if (!parsed.ok) return jsonResponse({ error: parsed.error }, parsed.status);

    let ctx;
    try {
      ctx = await buildInboxAiContext(auth.supabase, parsed.stableKey, {
        includeVoiceTranscriptions: parsed.includeVoiceTranscriptions,
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

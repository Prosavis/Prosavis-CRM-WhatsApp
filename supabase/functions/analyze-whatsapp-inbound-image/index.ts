import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { analyzeInboundImageById, analyzeUncachedInboundImagesForConversation } from '../_shared/analyzeInboundImage.ts';
import { resolveInboxAiOrGrokClient } from '../_shared/inboxAiContextAuth.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await resolveInboxAiOrGrokClient(req);
    if ('error' in auth && auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const messageLogId = String(body.messageLogId ?? '').trim();
    const stableKey = String(body.stableKey ?? body.phone ?? '').trim();
    const force = body.force === true;
    const messageLogIds = Array.isArray(body.messageLogIds)
      ? body.messageLogIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : undefined;

    if (messageLogId) {
      const item = await analyzeInboundImageById(auth.supabase, messageLogId, { force });
      if (item.status === 'failed') {
        return jsonResponse({ error: item.reason || 'No se pudo analizar la imagen.', ...item }, 500);
      }
      if (item.status === 'skipped') {
        return jsonResponse({ error: item.reason || 'Imagen no analizable.', ...item }, 400);
      }
      return jsonResponse({
        success: true,
        analysis: item.analysis,
        cached: item.status === 'cached' || item.status === 'reused',
        ...item,
      });
    }

    if (!stableKey) {
      return jsonResponse({ error: 'Se requiere messageLogId, stableKey o phone.' }, 400);
    }

    const batch = await analyzeUncachedInboundImagesForConversation(auth.supabase, stableKey, {
      messageLogIds,
      force,
    });
    return jsonResponse({ success: true, ...batch });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

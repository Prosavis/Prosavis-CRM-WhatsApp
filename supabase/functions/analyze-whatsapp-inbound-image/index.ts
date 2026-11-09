import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { analyzeInboundImageById, analyzeUncachedInboundImagesForConversation } from '../_shared/analyzeInboundImage.ts';
import { resolveInboxAiOrGrokClient } from '../_shared/inboxAiContextAuth.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';

function analysisFailureMessage(reason: string | undefined): string {
  switch (reason) {
    case 'too_large':
      return 'El archivo supera el tamaño máximo para analizarlo.';
    case 'daily_cap':
      return 'Se alcanzó el cupo de análisis de este chat (20 en 24 h).';
    case 'no_storage_path':
      return 'El archivo todavía no está en Storage.';
    case 'not_pdf':
      return 'Solo se analizan PDF.';
    case 'not_image':
      return 'Este mensaje no se puede analizar.';
    case 'not_inbound':
      return 'Solo se analizan archivos que envió el cliente.';
    case 'bad_mime':
      return 'Ese tipo de archivo no se puede analizar.';
    default:
      return reason || 'No se pudo analizar el archivo.';
  }
}

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
        return jsonResponse({ error: analysisFailureMessage(item.reason), ...item }, 500);
      }
      if (item.status === 'skipped') {
        return jsonResponse({ error: analysisFailureMessage(item.reason), ...item }, 400);
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

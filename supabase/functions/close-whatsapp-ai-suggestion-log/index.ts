import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { closeWhatsAppAiSuggestionLogById } from '../_shared/inboxAiSuggestionLog.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const suggestionLogId = String(body.suggestionLogId ?? '').trim();
    const sentText = typeof body.sentText === 'string' ? body.sentText : '';
    const actionTaken =
      typeof body.actionTaken === 'string' && body.actionTaken.trim()
        ? body.actionTaken.trim()
        : 'send_text';

    if (!suggestionLogId) {
      return jsonResponse({ error: 'Se requiere suggestionLogId.' }, 400);
    }
    if (!sentText.trim()) {
      return jsonResponse({ error: 'Se requiere sentText no vacío.' }, 400);
    }

    const result = await closeWhatsAppAiSuggestionLogById(supabase, {
      suggestionLogId,
      sentText,
      actionTaken,
    });

    if (!result.ok) {
      return jsonResponse(
        { error: 'No se pudo cerrar el log de sugerencia.', editRatio: result.editRatio },
        404,
      );
    }

    return jsonResponse({
      success: true,
      editRatio: result.editRatio,
      suggestionLogId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

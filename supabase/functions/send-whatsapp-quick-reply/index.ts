import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError, sendTextOutbound } from '../_shared/whatsappOutbound.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const recipientPhone = String(body.recipientPhone ?? '').trim();
    const text = String(body.body ?? '').trim();
    const templateId = body.templateId ? String(body.templateId).trim() : undefined;
    const phoneNumberId = body.phoneNumberId ? String(body.phoneNumberId).trim() : undefined;

    if (!recipientPhone || !text) {
      return jsonResponse({ error: 'Se requieren recipientPhone y body.' }, 400);
    }

    const result = await sendTextOutbound(supabase, {
      to: recipientPhone,
      text,
      phoneNumberId,
      agentUid: user.id,
      campaignType: 'QUICK_REPLY_PANEL',
      templateName: templateId ? `rich_${templateId}` : 'quick_reply',
    });

    if (!result.success) {
      return jsonResponse({ error: result.error ?? 'No se pudo enviar el mensaje.' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

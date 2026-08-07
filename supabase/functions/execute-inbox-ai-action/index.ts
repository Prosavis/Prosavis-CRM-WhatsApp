import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  ExecuteInboxAiActionError,
  executeInboxAiAction,
  parseExecuteInboxAiActionRequest,
} from '../_shared/inboxAiActionExecution.ts';
import { createInboxAiActionExecutionDeps } from '../_shared/inboxAiActionExecutionDeps.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const parsed = parseExecuteInboxAiActionRequest(body);
    const wabaId = typeof body?.wabaId === 'string' ? body.wabaId.trim() : '';

    const deps = createInboxAiActionExecutionDeps({
      supabase,
      crmAdminId: user.id,
      agentUid: user.id,
      wabaId: wabaId || undefined,
    });

    const result = await executeInboxAiAction({
      stableKey: parsed.stableKey,
      action: parsed.action,
      suggestionFingerprint: parsed.suggestionFingerprint,
      deps,
    });

    return jsonResponse({ success: true, result });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ExecuteInboxAiActionError) {
      return jsonResponse(
        { error: error.message, code: error.code },
        error.status,
      );
    }
    const message = formatError(error);
    if (/no encontrada|not found/i.test(message)) {
      return jsonResponse({ error: message }, 404);
    }
    return jsonResponse({ error: message }, 500);
  }
});

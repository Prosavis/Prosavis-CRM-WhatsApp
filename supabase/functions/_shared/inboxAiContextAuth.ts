import { jsonResponse } from './cors.ts';
import { getServiceClient, requireCrmAdmin } from './supabase.ts';
import { isInboxAiContextApiKeyValid } from './inboxAiContextPack.ts';

export async function resolveInboxAiOrGrokClient(req: Request) {
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

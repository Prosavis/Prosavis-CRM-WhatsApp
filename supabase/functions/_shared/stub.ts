import { corsHeaders, jsonResponse } from './cors.ts';
import { requireCrmAdmin } from './supabase.ts';

export function serveStub(defaultBody: Record<string, unknown> = { success: true }) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      await requireCrmAdmin(req);
      if (req.method !== 'GET') await req.json().catch(() => ({}));
      return jsonResponse(defaultBody);
    } catch (error) {
      if (error instanceof Response) return error;
      return jsonResponse({ error: String(error) }, 500);
    }
  });
}

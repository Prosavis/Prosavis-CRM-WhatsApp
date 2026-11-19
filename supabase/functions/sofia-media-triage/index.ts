// Clasifica imágenes y documentos en el servidor. No envía mensajes y no analiza videos.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { runTriageClassify, runTriageRules, triageReport } from '../_shared/sofiaTriage.mjs';

function authorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (service && auth === `Bearer ${service}`) return true;
  const secret = Deno.env.get('SOFIA_DRAFT_SWEEP_SECRET') ?? '';
  return Boolean(secret && req.headers.get('x-sofia-draft-sweep') === secret);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: 'Worker no autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const step = String(body.paso ?? 'reglas');
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (step === 'informe') {
    return jsonResponse(await triageReport({ supabaseUrl: url, serviceKey: key }));
  }
  if (step === 'clasificar') {
    const result = await runTriageClassify({
      supabaseUrl: url,
      serviceKey: key,
      geminiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
      model: Deno.env.get('GEMINI_TRIAGE_MODEL') || 'gemini-3.8-flash',
      usdMax: Math.min(Number(body.usdMax) || 2, 8),
      limit: Math.min(Number(body.limit) || 8, 20),
      runId: typeof body.runId === 'string' ? body.runId : null,
    });
    return jsonResponse(result);
  }
  const rules = await runTriageRules({ supabaseUrl: url, serviceKey: key });
  return jsonResponse({ reglas: rules });
});

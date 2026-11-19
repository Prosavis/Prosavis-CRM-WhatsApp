// Un lote corto de diagnóstico. El corrido completo sigue en el script, con el tope de dólares.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { runDiagnosisBatch } from '../_shared/sofiaDiagnose.mjs';

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
  const result = await runDiagnosisBatch({
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    anthropicKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
    usdMax: Math.min(Number(body.usdMax) || 1, 4),
    limit: Math.min(Number(body.limite) || 2, 4),
    runId: typeof body.runId === 'string' ? body.runId : null,
  });
  return jsonResponse(result);
});

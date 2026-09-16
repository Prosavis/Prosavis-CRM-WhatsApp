import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { processDocumentAnalysisJob } from '../_shared/documentAnalysis/processor.ts';

function isWorkerAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (service && auth === `Bearer ${service}`) return true;
  const secret = Deno.env.get('DOCUMENT_ANALYSIS_WORKER_SECRET') ?? '';
  return Boolean(secret && req.headers.get('x-document-analysis-worker') === secret);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!isWorkerAuthorized(req)) {
      return jsonResponse({ error: 'Worker no autorizado' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'process');
    if (action !== 'process') {
      return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
    }

    const supabase = getServiceClient();
    const worker = `edge:${crypto.randomUUID()}`;
    const limit = Math.min(Math.max(Number(body.limit ?? 4), 1), 8);
    const { data: jobs, error } = await supabase.rpc('claim_document_analysis_jobs', {
      p_worker: worker,
      p_limit: limit,
      p_lease_duration: '8 minutes',
    });
    if (error) return jsonResponse({ error: error.message }, 500);

    const results = [];
    for (const job of jobs ?? []) {
      results.push(await processDocumentAnalysisJob(supabase, job, worker));
    }
    return jsonResponse({ worker, claimed: (jobs ?? []).length, results });
  } catch (error) {
    console.error('document-analysis-worker error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});

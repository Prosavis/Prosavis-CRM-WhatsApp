/**
 * run-whatsapp-reactivations
 *
 * Worker server-to-server (x-api-key) que ejecuta el pipeline de reactivación:
 * segmento inactivo → paso debido → envío Meta → estado crm_directory + snapshot.
 *
 * Body opcional:
 *   { dryRun?: boolean, limit?: number, previewOnly?: boolean, runKind?: string }
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { runReactivations } from '../_shared/reactivationRunner.ts';

function verifyApiKey(req: Request): boolean {
  const apiKey = req.headers.get('x-api-key')?.trim();
  const expected =
    Deno.env.get('REACTIVATION_API_KEY')?.trim() ||
    Deno.env.get('REMINDER_API_KEY')?.trim();
  return Boolean(apiKey && expected && apiKey === expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!verifyApiKey(req)) {
      return jsonResponse({ error: 'No autorizado.' }, 401);
    }

    const body = req.method === 'GET'
      ? {}
      : await req.json().catch(() => ({}));

    const dryRun = Boolean(body.dryRun);
    const previewOnly = Boolean(body.previewOnly);
    const limit = body.limit != null ? Number(body.limit) : undefined;
    const runKind = typeof body.runKind === 'string' ? body.runKind : undefined;
    const schedulerName =
      typeof body.schedulerName === 'string' && body.schedulerName.trim()
        ? body.schedulerName.trim()
        : 'sendWhatsAppReactivations';

    const supabase = getServiceClient();
    const result = await runReactivations({
      supabase,
      dryRun,
      previewOnly,
      limit: Number.isFinite(limit) ? limit : undefined,
      runKind: runKind as 'primary' | 'retry' | 'manual' | 'dry_run' | undefined,
      schedulerName,
    });

    return jsonResponse({
      success: true,
      runId: result.runId,
      runDate: result.runDate,
      dryRun: result.dryRun,
      stats: result.stats,
      dueCount: result.due.length,
      enrolledCount: result.enrolled.length,
      events: result.events.slice(0, 200),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

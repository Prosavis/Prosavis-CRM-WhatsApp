import { requireAdmin } from '../_shared/adminAuth.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import {
  bootstrapToLegacyMetrics,
  loadHistoricalBootstrap,
} from '../_shared/historicalBootstrap.ts';
import {
  completedMetaFromDaily,
} from '../_shared/metricsWindows.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  let stage = 'auth';
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const phoneNumberId =
      typeof body.phoneNumberId === 'string' && body.phoneNumberId.trim()
        ? body.phoneNumberId.trim()
        : undefined;

    stage = 'bootstrap';
    const bootstrap = await loadHistoricalBootstrap(supabase, {
      serviceId,
      phoneNumberId,
    });

    const firstDay = bootstrap.completedDaily[0]?.bucket ?? bootstrap.today;
    const lastDay = bootstrap.today;
    const legacy = bootstrapToLegacyMetrics(bootstrap);

    stage = 'response';
    return strictJsonResponse(req, {
      ...legacy,
      completedMeta: completedMetaFromDaily(
        bootstrap.completedDaily,
        bootstrap.today,
        firstDay,
        lastDay,
        bootstrap.period.from,
        bootstrap.period.to,
      ),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = `[${stage}] ${errorMessage(error)}`;
    console.error('get-whatsapp-metrics failed', message, error);
    return strictJsonResponse(req, { error: message, stage }, 500);
  }
});

import { requireAdmin } from '../_shared/adminAuth.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import { callRpc, mapQualityNucleus } from '../_shared/historicalBootstrap.ts';
import {
  buildQualityMetricsFromNucleus,
  qualitySummaryWithoutClients,
} from '../_shared/qualityMetrics.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

function optionalIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const mode = body.mode === 'detail' ? 'detail' : 'summary';
    const limit = Math.min(Math.max(Number(body.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(body.offset ?? 0) || 0, 0);

    const nucleus = mapQualityNucleus(
      await callRpc(supabase, 'metrics_quality_nucleus', { p_service_id: serviceId }),
    );
    const metrics = buildQualityMetricsFromNucleus(nucleus, {
      from: optionalIso(body.from),
      to: optionalIso(body.to),
    });

    if (mode === 'summary') {
      return strictJsonResponse(req, {
        ...qualitySummaryWithoutClients(metrics),
        clients: [],
        serviceId,
      });
    }

    const items = metrics.clients.slice(offset, offset + limit);
    return strictJsonResponse(req, {
      ...qualitySummaryWithoutClients(metrics),
      clients: items,
      nextCursor: offset + items.length < metrics.clients.length
        ? String(offset + items.length)
        : null,
      hasMore: offset + items.length < metrics.clients.length,
      serviceId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('get-client-quality-metrics failed', error);
    return strictJsonResponse(req, { error: String(error) }, 500);
  }
});

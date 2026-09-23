import { requireAdmin } from '../_shared/adminAuth.ts';
import { qualityLayer, type QualityLayer } from '../_shared/clientClassification.ts';
import { phoneLookupKey } from '../_shared/clientSegments.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import { callRpc, mapHeatmapSummary, mapQualityNucleus } from '../_shared/historicalBootstrap.ts';
import {
  buildAppointmentHeatmap,
  type HeatmapBookingInput,
} from '../_shared/appointmentHeatmap.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

const LAYERS = new Set<QualityLayer>(['risk', 'favorite', 'recurring', 'standard']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asCoord(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function appointmentDetail(row: Record<string, unknown>) {
  const address = [textField(row.location_address), textField(row.barrio), textField(row.comuna)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  return {
    clientName: textField(row.client_name),
    address: address || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const mode = body.mode === 'detail' ? 'detail' : 'summary';
    const preferGps = body.source !== 'address';
    const statusFilter =
      typeof body.status === 'string' && body.status && body.status !== 'all'
        ? body.status
        : null;
    const layerFilter =
      typeof body.layer === 'string' && LAYERS.has(body.layer as QualityLayer)
        ? (body.layer as QualityLayer)
        : null;
    const limit = Math.min(Math.max(Number(body.limit ?? 500) || 500, 1), 1000);
    const offset = Math.max(Number(body.offset ?? 0) || 0, 0);

    const summary = mapHeatmapSummary(
      await callRpc(supabase, 'metrics_heatmap_summary', { p_service_id: serviceId }),
    );

    if (mode === 'summary') {
      return strictJsonResponse(req, {
        points: [],
        coverage: summary.coverage,
        daily: summary.daily,
        source: preferGps ? 'gps' : 'address',
        serviceId,
      });
    }

    const [pointsRaw, nucleus] = await Promise.all([
      callRpc<unknown[]>(supabase, 'metrics_heatmap_points_page', {
        p_service_id: serviceId,
        p_limit: limit,
        p_offset: offset,
        p_status: statusFilter,
      }),
      callRpc(supabase, 'metrics_quality_nucleus', { p_service_id: serviceId }),
    ]);

    const layerByPhone = new Map<string, QualityLayer>();
    for (const row of mapQualityNucleus(nucleus)) {
      const layer = qualityLayer(
        { classification: row.classification, tags: row.tags },
        row.completed_count,
      );
      const phoneKey = phoneLookupKey(row.phone);
      if (phoneKey) layerByPhone.set(`p:${phoneKey}`, layer);
      if (row.directory_id) layerByPhone.set(`c:${row.directory_id}`, layer);
    }

    const layerByAppointment = new Map<string, QualityLayer>();
    const detailByAppointment = new Map<string, ReturnType<typeof appointmentDetail>>();
    const bookings: HeatmapBookingInput[] = [];
    for (const raw of pointsRaw ?? []) {
      const row = asRecord(raw);
      const appointmentId = String(row.appointment_id ?? '');
      if (!appointmentId) continue;
      const phoneKey = phoneLookupKey(typeof row.client_phone === 'string' ? row.client_phone : null);
      const clientId = typeof row.client_id === 'string' ? row.client_id : null;
      const layer = (phoneKey && layerByPhone.get(`p:${phoneKey}`))
        || (clientId && layerByPhone.get(`c:${clientId}`))
        || 'standard';
      if (layerFilter && layer !== layerFilter) continue;
      layerByAppointment.set(appointmentId, layer);
      detailByAppointment.set(appointmentId, appointmentDetail(row));
      bookings.push({
        appointmentId,
        status: String(row.status ?? ''),
        scheduledStart: typeof row.scheduled_start === 'string' ? row.scheduled_start : null,
        startLatitude: asCoord(row.start_latitude),
        startLongitude: asCoord(row.start_longitude),
        addressLatitude: asCoord(row.latitude),
        addressLongitude: asCoord(row.longitude),
        clientPhone: typeof row.client_phone === 'string' ? row.client_phone : null,
        clientId,
      });
    }

    const heatmap = buildAppointmentHeatmap({
      bookings,
      layerByAppointment,
      preferGps,
    });
    const points = heatmap.points.map((point) => ({
      ...point,
      ...detailByAppointment.get(point.id),
    }));

    return strictJsonResponse(req, {
      ...heatmap,
      points,
      coverage: summary.coverage,
      daily: summary.daily,
      source: preferGps ? 'gps' : 'address',
      nextCursor: (pointsRaw?.length ?? 0) >= limit ? String(offset + limit) : null,
      hasMore: (pointsRaw?.length ?? 0) >= limit,
      serviceId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('get-appointment-heatmap failed', error);
    return strictJsonResponse(req, { error: String(error) }, 500);
  }
});

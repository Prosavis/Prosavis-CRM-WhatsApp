import { requireAdmin } from '../_shared/adminAuth.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import { callRpc } from '../_shared/historicalBootstrap.ts';
import { APPOINTMENT_STATUS_GROUP_VALUES } from '../_shared/metricsContract.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function resolveStatuses(body: Record<string, unknown>): string[] | null {
  const group = typeof body.statusGroup === 'string' ? body.statusGroup : '';
  if (group && group in APPOINTMENT_STATUS_GROUP_VALUES) {
    return [...APPOINTMENT_STATUS_GROUP_VALUES[group as keyof typeof APPOINTMENT_STATUS_GROUP_VALUES]];
  }
  const statuses = asStringArray(body.statuses);
  if (statuses.length > 0) return statuses;
  if (typeof body.status === 'string' && body.status && body.status !== 'all') {
    return [body.status];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = asRecord(await req.json().catch(() => ({})));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const limit = Math.min(Math.max(Number(body.limit ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(body.offset ?? body.cursor ?? 0) || 0, 0);
    const statuses = resolveStatuses(body);

    const rows = await callRpc<unknown[]>(supabase, 'metrics_appointments_page', {
      p_service_id: serviceId,
      p_limit: limit,
      p_offset: offset,
      p_from: typeof body.from === 'string' ? body.from : null,
      p_to: typeof body.to === 'string' ? body.to : null,
      p_statuses: statuses,
    });

    const items = (rows ?? []).map((row) => {
      const rec = asRecord(row);
      return {
        id: String(rec.appointment_id ?? ''),
        scheduledDate: rec.scheduled_date ? String(rec.scheduled_date) : '',
        status: typeof rec.status === 'string' ? rec.status : null,
        clientName: typeof rec.client_name === 'string' ? rec.client_name : null,
        clientPhone: typeof rec.client_phone === 'string' ? rec.client_phone : null,
        providerName: typeof rec.provider_name === 'string' ? rec.provider_name : null,
        teamMemberId: typeof rec.team_member_id === 'string' ? rec.team_member_id : null,
        duration: asNumber(rec.duration),
        totalAmount: asNumber(rec.total_amount),
        paidAmount: asNumber(rec.paid_amount),
        pendingAmount: asNumber(rec.pending_amount),
        paymentStatus: typeof rec.payment_status === 'string' ? rec.payment_status : null,
        addressLine: typeof rec.location_address === 'string' ? rec.location_address : null,
        serviceTitle: null,
      };
    });

    return strictJsonResponse(req, {
      items,
      nextCursor: items.length >= limit ? String(offset + items.length) : null,
      hasMore: items.length >= limit,
      serviceId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(req, { error: String(error) }, 500);
  }
});

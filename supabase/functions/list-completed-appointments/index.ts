import { requireAdmin } from '../_shared/adminAuth.ts';
import { resolveRequestedServiceId } from '../_shared/fetchAllRows.ts';
import { callRpc } from '../_shared/historicalBootstrap.ts';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const limit = Math.min(Math.max(Number(body.limit ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(body.offset ?? body.cursor ?? 0) || 0, 0);

    const rows = await callRpc<unknown[]>(supabase, 'metrics_completed_appointments_page', {
      p_service_id: serviceId,
      p_limit: limit,
      p_offset: offset,
      p_from: typeof body.from === 'string' ? body.from : null,
      p_to: typeof body.to === 'string' ? body.to : null,
    });

    const items = (rows ?? []).map((row) => {
      const rec = asRecord(row);
      return {
        id: String(rec.appointment_id ?? ''),
        scheduledDate: rec.scheduled_date ? String(rec.scheduled_date) : '',
        clientName: typeof rec.client_name === 'string' ? rec.client_name : null,
        clientPhone: typeof rec.client_phone === 'string' ? rec.client_phone : null,
        providerName: null,
        teamMemberId: null,
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

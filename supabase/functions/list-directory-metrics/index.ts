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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const serviceId = resolveRequestedServiceId(body.serviceId);
    const limit = Math.min(Math.max(Number(body.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(body.offset ?? body.cursor ?? 0) || 0, 0);

    const rows = await callRpc<unknown[]>(supabase, 'metrics_directory_page', {
      p_service_id: serviceId,
      p_limit: limit,
      p_offset: offset,
    });

    const items = (rows ?? []).map((row) => {
      const rec = asRecord(row);
      return {
        id: String(rec.id ?? ''),
        name: typeof rec.name === 'string' ? rec.name : null,
        phone: typeof rec.phone === 'string' ? rec.phone : null,
        classification: typeof rec.classification === 'string' ? rec.classification : null,
        tags: Array.isArray(rec.tags) ? rec.tags.filter((t): t is string => typeof t === 'string') : [],
        isCompany: Boolean(rec.is_company),
        isRecurring: Boolean(rec.is_recurring),
        isAgendado: Boolean(rec.is_agendado),
        isFavorite: Boolean(rec.is_favorite),
        isClient: Boolean(rec.is_client),
        isActive: Boolean(rec.is_active),
        isBlacklisted: Boolean(rec.is_blacklisted),
        blacklistReason: typeof rec.blacklist_reason === 'string' ? rec.blacklist_reason : null,
        lastAppointmentDate: rec.last_appointment_date
          ? String(rec.last_appointment_date)
          : null,
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

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { phoneLookupKey } from '../_shared/clientSegments.ts';
import { fetchAllRows, resolveCleaningServiceId } from '../_shared/fetchAllRows.ts';
import { buildQualityMetrics } from '../_shared/qualityMetrics.ts';

interface DirectoryRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  phone: string | null;
  phone_key: string | null;
  app_user_id: string | null;
  classification: string | null;
  tags: string[] | null;
}

interface BookingRow {
  appointment_id: string;
  status: string;
  payment_status: string | null;
  client_id: string | null;
  client_phone: string | null;
  scheduled_start: string | null;
}

function asTagArray(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

function optionalIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const fromIso = optionalIso(body.from);
    const toIso = optionalIso(body.to);
    const serviceId = resolveCleaningServiceId();

    const directoryRows = await fetchAllRows<DirectoryRow>(
      'crm_directory',
      (rangeFrom, rangeTo) =>
        supabase
          .from('crm_directory')
          .select('id,full_name,display_name,phone,phone_key,app_user_id,classification,tags')
          .order('created_at', { ascending: true })
          .range(rangeFrom, rangeTo),
    );

    let bookingQuery = (rangeFrom: number, rangeTo: number) => {
      let q = supabase
        .from('bookings')
        .select('appointment_id,status,payment_status,client_id,client_phone,scheduled_start')
        .eq('service_id', serviceId)
        .is('source_deleted_at', null)
        .in('status', ['COMPLETED', 'CANCELED'])
        .order('scheduled_start', { ascending: true })
        .range(rangeFrom, rangeTo);
      if (fromIso) q = q.gte('scheduled_start', fromIso);
      if (toIso) q = q.lte('scheduled_start', toIso);
      return q;
    };

    const bookingRows = await fetchAllRows<BookingRow>('bookings', bookingQuery);

    const metrics = buildQualityMetrics({
      phoneKey: phoneLookupKey,
      fromIso,
      toIso,
      directory: directoryRows.map((row) => ({
        id: row.id,
        name: row.display_name || row.full_name,
        phone: row.phone,
        phoneKey: row.phone_key,
        appUserId: row.app_user_id,
        classification: row.classification,
        tags: asTagArray(row.tags),
      })),
      bookings: bookingRows.map((row) => ({
        appointmentId: row.appointment_id,
        status: row.status,
        paymentStatus: row.payment_status,
        clientId: row.client_id,
        clientPhone: row.client_phone,
        scheduledStart: row.scheduled_start,
      })),
    });

    return jsonResponse(metrics);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('get-client-quality-metrics failed', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});

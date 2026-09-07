import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { isTestContact, type QualityLayer } from '../_shared/clientClassification.ts';
import { phoneLookupKey } from '../_shared/clientSegments.ts';
import { fetchAllRows, resolveCleaningServiceId } from '../_shared/fetchAllRows.ts';
import {
  buildAppointmentHeatmap,
  layerForDirectory,
  type HeatmapBookingInput,
} from '../_shared/appointmentHeatmap.ts';

interface DirectoryRow {
  id: string;
  phone: string | null;
  phone_key: string | null;
  app_user_id: string | null;
  classification: string | null;
  tags: string[] | null;
}

interface BookingRow {
  appointment_id: string;
  status: string;
  scheduled_start: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  latitude: number | null;
  longitude: number | null;
  client_id: string | null;
  client_phone: string | null;
}

const LAYERS = new Set<QualityLayer>(['risk', 'favorite', 'recurring', 'standard']);

function asTagArray(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
  return [];
}

function optionalIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function directoryMatchKeys(row: DirectoryRow): string[] {
  const keys = new Set<string>();
  if (row.phone_key) keys.add(`p:${row.phone_key}`);
  const fromPhone = phoneLookupKey(row.phone);
  if (fromPhone) keys.add(`p:${fromPhone}`);
  if (row.app_user_id) keys.add(`c:${row.app_user_id}`);
  if (row.id) keys.add(`c:${row.id}`);
  return [...keys];
}

function bookingMatchKey(row: BookingRow): string | null {
  const pk = phoneLookupKey(row.client_phone);
  if (pk) return `p:${pk}`;
  if (row.client_id?.trim()) return `c:${row.client_id.trim()}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const fromIso = optionalIso(body.from);
    const toIso = optionalIso(body.to);
    const preferGps = body.source !== 'address';
    const statusFilter =
      typeof body.status === 'string' && body.status && body.status !== 'all'
        ? body.status
        : null;
    const layerFilter =
      typeof body.layer === 'string' && LAYERS.has(body.layer as QualityLayer)
        ? (body.layer as QualityLayer)
        : null;
    const serviceId = resolveCleaningServiceId();

    const directoryRows = await fetchAllRows<DirectoryRow>(
      'crm_directory',
      (rangeFrom, rangeTo) =>
        supabase
          .from('crm_directory')
          .select('id,phone,phone_key,app_user_id,classification,tags')
          .order('created_at', { ascending: true })
          .range(rangeFrom, rangeTo),
    );

    const bookingRows = await fetchAllRows<BookingRow>('bookings', (rangeFrom, rangeTo) => {
      let q = supabase
        .from('bookings')
        .select(
          'appointment_id,status,scheduled_start,start_latitude,start_longitude,latitude,longitude,client_id,client_phone',
        )
        .eq('service_id', serviceId)
        .is('source_deleted_at', null)
        .order('scheduled_start', { ascending: true })
        .range(rangeFrom, rangeTo);
      if (fromIso) q = q.gte('scheduled_start', fromIso);
      if (toIso) q = q.lte('scheduled_start', toIso);
      if (statusFilter) q = q.eq('status', statusFilter);
      return q;
    });

    const completedByKey = new Map<string, number>();
    for (const row of bookingRows) {
      if (row.status !== 'COMPLETED') continue;
      const key = bookingMatchKey(row);
      if (!key) continue;
      completedByKey.set(key, (completedByKey.get(key) ?? 0) + 1);
    }

    const layerByKey = new Map<string, QualityLayer>();
    for (const row of directoryRows) {
      if (isTestContact({ classification: row.classification, tags: asTagArray(row.tags) })) {
        continue;
      }
      const keys = directoryMatchKeys(row);
      let completedCount = 0;
      for (const key of keys) {
        completedCount = Math.max(completedCount, completedByKey.get(key) ?? 0);
      }
      const layer = layerForDirectory({
        id: row.id,
        phoneKey: row.phone_key,
        phone: row.phone,
        appUserId: row.app_user_id,
        classification: row.classification,
        tags: asTagArray(row.tags),
        completedCount,
      });
      for (const key of keys) layerByKey.set(key, layer);
    }

    const layerByAppointment = new Map<string, QualityLayer>();
    const heatmapBookings: HeatmapBookingInput[] = [];
    for (const row of bookingRows) {
      const key = bookingMatchKey(row);
      const layer = (key && layerByKey.get(key)) || 'standard';
      if (layerFilter && layer !== layerFilter) continue;
      layerByAppointment.set(row.appointment_id, layer);
      heatmapBookings.push({
        appointmentId: row.appointment_id,
        status: row.status,
        scheduledStart: row.scheduled_start,
        startLatitude: row.start_latitude,
        startLongitude: row.start_longitude,
        addressLatitude: row.latitude,
        addressLongitude: row.longitude,
        clientPhone: row.client_phone,
        clientId: row.client_id,
      });
    }

    const heatmap = buildAppointmentHeatmap({
      bookings: heatmapBookings,
      layerByAppointment,
      preferGps,
    });

    return jsonResponse({
      ...heatmap,
      source: preferGps ? 'gps' : 'address',
      serviceId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('get-appointment-heatmap failed', error);
    return jsonResponse({ error: String(error) }, 500);
  }
});

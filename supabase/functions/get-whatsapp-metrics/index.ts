import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  hasAgendadoTag,
  hasBlacklistTag,
  hasFavoritosTag,
  isCompanyClient,
  isRecurringClient,
  isTestContact,
} from '../_shared/clientClassification.ts';
import { runFirestoreQuery } from '../_shared/firebaseAdminRest.ts';
import {
  ACTIVE_CLIENT_WINDOW_DAYS,
  CLIENT_APPOINTMENT_LOOKBACK_MONTHS,
  asTagArray,
  buildClientAppointmentsQuery,
  phoneLookupKey,
  resolveLastAppointment as resolveLastAppointmentFromIndex,
  scheduledDateToIso,
  type LastAppointmentIndex,
} from '../_shared/clientSegments.ts';

interface MessageLogRow {
  direction: 'inbound' | 'outbound';
  status: string;
  campaign_type: string | null;
  template_name: string | null;
  conversation_stable_key: string | null;
  created_at: string;
}

interface DirectoryRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  phone: string | null;
  phone_key: string | null;
  app_user_id: string | null;
  classification: string | null;
  tags: string[] | null;
  status: string | null;
  opt_out: boolean | null;
  active_sequence: string | null;
  pending_appointments_count: number | null;
  first_contact_at: string | null;
  created_at: string | null;
  internal_notes: string | null;
}

interface BlocklistRow {
  phone: string | null;
  stable_key: string | null;
  bsuid: string | null;
  reason: string | null;
}

interface OutboundBucket {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  outboundOk: number;
  total: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error) {
    const maybe = error as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof maybe.message === 'string' && maybe.message) {
      const extras = [maybe.code, maybe.details, maybe.hint].filter(Boolean).join(' | ');
      return extras ? `${maybe.message} (${extras})` : maybe.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/** America/Bogota is UTC-5 year-round (no DST). */
function bogotaDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const bogotaMs = d.getTime() - 5 * 60 * 60 * 1000;
  const bogota = new Date(bogotaMs);
  if (Number.isNaN(bogota.getTime())) return null;
  return bogota.toISOString().slice(0, 10);
}

function parseDayKey(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function weekKeyFromDay(day: string): string {
  const date = parseDayKey(day);
  const dow = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function monthKeyFromDay(day: string): string {
  return day.slice(0, 7);
}

function eachDayInclusive(startKey: string, endKey: string): string[] {
  if (startKey > endKey) return [];
  const days: string[] = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < 400) {
    days.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    guard += 1;
  }
  return days;
}

type PeopleBucket = {
  messagesReceived: number;
  people: Set<string>;
  newPeople: Set<string>;
  existingPeople: Set<string>;
};

function ensurePeopleBucket(map: Map<string, PeopleBucket>, key: string): PeopleBucket {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = {
      messagesReceived: 0,
      people: new Set(),
      newPeople: new Set(),
      existingPeople: new Set(),
    };
    map.set(key, bucket);
  }
  return bucket;
}

function serializePeopleBuckets(
  map: Map<string, PeopleBucket>,
  orderedKeys: string[],
): Array<{
  bucket: string;
  messagesReceived: number;
  uniquePeople: number;
  newPeople: number;
  existingPeople: number;
}> {
  return orderedKeys.map((key) => {
    const b = map.get(key);
    return {
      bucket: key,
      messagesReceived: b?.messagesReceived ?? 0,
      uniquePeople: b?.people.size ?? 0,
      newPeople: b?.newPeople.size ?? 0,
      existingPeople: b?.existingPeople.size ?? 0,
    };
  });
}

function emptyBucket(): OutboundBucket {
  return { sent: 0, delivered: 0, read: 0, failed: 0, outboundOk: 0, total: 0 };
}

function accumulate(bucket: OutboundBucket, status: string): void {
  bucket.total += 1;
  if (status === 'failed') bucket.failed += 1;
  if (status === 'read') bucket.read += 1;
  if (status === 'delivered') bucket.delivered += 1;
  if (['sent', 'delivered', 'read'].includes(status)) {
    bucket.sent += 1;
    bucket.outboundOk += 1;
  }
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Dirección legible: serviceAddress.addressLine con fallback a location.address. */
function resolveAddressLine(data: Record<string, unknown>): string | null {
  const serviceAddress = data.serviceAddress;
  if (serviceAddress && typeof serviceAddress === 'object') {
    const line = asTrimmedString((serviceAddress as Record<string, unknown>).addressLine);
    if (line) return line;
  }
  const location = data.location;
  if (location && typeof location === 'object') {
    const addr = asTrimmedString((location as Record<string, unknown>).address);
    if (addr) return addr;
  }
  return null;
}

/** Suma día Bogotá + delta (soporta negativos). */
function addDaysToKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Suma mes (`YYYY-MM`) + delta. */
function addMonthsToKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Total de citas COMPLETED (por día Bogotá) en el rango inclusivo [startKey, endKey]. */
function sumCompletedInRange(
  byDay: Map<string, number>,
  startKey: string,
  endKey: string,
): number {
  if (startKey > endKey) return 0;
  let total = 0;
  for (const [day, count] of byDay) {
    if (day >= startKey && day <= endKey) total += count;
  }
  return total;
}

/** Comparación current vs previous con crecimiento % (alineado con la serie). */
function buildComparison(
  current: number,
  previous: number,
): { current: number; previous: number; growth: number | null } {
  let growth: number | null = null;
  if (previous > 0) {
    growth = Math.round(((current - previous) / previous) * 1000) / 10;
  } else if (previous === 0 && current > 0) {
    growth = 100;
  }
  return { current, previous, growth };
}

/**
 * Citas COMPLETED en Firestore (fuente de verdad), ventana por scheduledDate.
 * Opcionalmente filtra por serviceId si PROSAVIS_SERVICE_ID está definido.
 */
function buildCompletedAppointmentsQuery(
  startIso: string,
  endIso: string,
  serviceId?: string,
): Record<string, unknown> {
  const filters: Record<string, unknown>[] = [
    {
      fieldFilter: {
        field: { fieldPath: 'status' },
        op: 'EQUAL',
        value: { stringValue: 'COMPLETED' },
      },
    },
    {
      fieldFilter: {
        field: { fieldPath: 'scheduledDate' },
        op: 'GREATER_THAN_OR_EQUAL',
        value: { timestampValue: startIso },
      },
    },
    {
      fieldFilter: {
        field: { fieldPath: 'scheduledDate' },
        op: 'LESS_THAN_OR_EQUAL',
        value: { timestampValue: endIso },
      },
    },
  ];

  if (serviceId) {
    filters.unshift({
      fieldFilter: {
        field: { fieldPath: 'serviceId' },
        op: 'EQUAL',
        value: { stringValue: serviceId },
      },
    });
  }

  return {
    where: {
      compositeFilter: { op: 'AND', filters },
    },
  };
}

/**
 * PostgREST enforce max_rows (~1000). Paginate with .range() until exhausted.
 */
async function fetchAllRows<T>(
  label: string,
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxPages = 100,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildPage(from, to);
    if (error) throw new Error(`${label}: ${errorMessage(error)}`);
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let stage = 'auth';
  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days ?? 30) || 30, 1), 90);
    const from = new Date();
    from.setDate(from.getDate() - days);
    const to = new Date();

    // Servicios: ventana amplia (6 meses) — en DB el último COMPLETED puede ser >30d
    const completedFrom = new Date(to);
    completedFrom.setMonth(completedFrom.getMonth() - 6);

    stage = 'query_message_log';
    const phoneNumberId =
      typeof body.phoneNumberId === 'string' && body.phoneNumberId.trim()
        ? body.phoneNumberId.trim()
        : undefined;

    const rows = await fetchAllRows<MessageLogRow>('message_log', (rangeFrom, rangeTo) => {
      let q = supabase
        .from('whatsapp_message_log')
        .select(
          'direction,status,campaign_type,template_name,conversation_stable_key,created_at',
        )
        .eq('hidden_from_panel', false)
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: true })
        .range(rangeFrom, rangeTo);
      if (phoneNumberId) q = q.eq('phone_number_id', phoneNumberId);
      return q;
    });

    stage = 'query_directory';
    const directoryRows = await fetchAllRows<DirectoryRow>('crm_directory', (rangeFrom, rangeTo) =>
      supabase
        .from('crm_directory')
        .select(
          'id,full_name,display_name,phone,phone_key,app_user_id,classification,tags,status,opt_out,active_sequence,pending_appointments_count,first_contact_at,created_at,internal_notes',
        )
        .order('created_at', { ascending: true })
        .range(rangeFrom, rangeTo),
    );

    stage = 'query_blocklist';
    const blocklistKeys = new Set<string>();
    const blocklistReasonByKey = new Map<string, string>();
    try {
      const blocklistRows = await fetchAllRows<BlocklistRow>(
        'whatsapp_blocklist',
        (rangeFrom, rangeTo) =>
          supabase
            .from('whatsapp_blocklist')
            .select('phone,stable_key,bsuid,reason')
            .range(rangeFrom, rangeTo),
      );
      const trackBlockKey = (raw: string | null | undefined, reason: string | null) => {
        if (!raw) return;
        const key = phoneLookupKey(raw) ?? raw.trim();
        if (!key) return;
        blocklistKeys.add(key);
        if (reason && !blocklistReasonByKey.has(key)) {
          blocklistReasonByKey.set(key, reason);
        }
      };
      for (const row of blocklistRows) {
        trackBlockKey(row.phone, row.reason);
        trackBlockKey(row.stable_key, row.reason);
        trackBlockKey(row.bsuid, row.reason);
      }
    } catch (blockErr) {
      console.error('whatsapp_blocklist query failed', blockErr);
    }

    stage = 'query_appointments';
    const serviceId = Deno.env.get('PROSAVIS_SERVICE_ID')?.trim() || undefined;
    let appointmentRows: Array<{
      id: string;
      status: string;
      scheduled_date: string | null;
      clientName: string | null;
      clientPhone: string | null;
      providerName: string | null;
      teamMemberId: string | null;
      duration: number | null;
      totalAmount: number | null;
      paidAmount: number | null;
      pendingAmount: number | null;
      paymentStatus: string | null;
      addressLine: string | null;
      serviceTitle: string | null;
    }> = [];
    try {
      const firestoreDocs = await runFirestoreQuery(
        'appointments',
        buildCompletedAppointmentsQuery(
          completedFrom.toISOString(),
          to.toISOString(),
          serviceId,
        ),
      );
      appointmentRows = firestoreDocs.map((doc) => {
        const d = doc.data;
        return {
          id: doc.id,
          status: String(d.status ?? 'COMPLETED'),
          scheduled_date: scheduledDateToIso(d.scheduledDate),
          clientName: asTrimmedString(d.clientName),
          clientPhone: asTrimmedString(d.clientPhone),
          providerName: asTrimmedString(d.providerName),
          teamMemberId: asTrimmedString(d.teamMemberId),
          duration: asFiniteNumber(d.duration),
          totalAmount: asFiniteNumber(d.totalAmount) ?? asFiniteNumber(d.price),
          paidAmount: asFiniteNumber(d.paidAmount),
          pendingAmount: asFiniteNumber(d.pendingAmount),
          paymentStatus: asTrimmedString(d.paymentStatus),
          addressLine: resolveAddressLine(d),
          serviceTitle: asTrimmedString(d.serviceTitle),
        };
      });
    } catch (apptErr) {
      console.error('Firestore appointments query failed', apptErr);
      appointmentRows = [];
    }

    // Clientes reales + última cita: citas (cualquier estado) en ventana amplia.
    // Se agrupan por teléfono normalizado y por app_user_id (uid Firebase).
    stage = 'query_client_appointments';
    let lastAppointmentIndex: LastAppointmentIndex = {
      byPhoneKey: new Map(),
      byAppUser: new Map(),
      appointmentCount: 0,
    };
    let clientAppointmentRows = 0;
    try {
      const clientFrom = new Date(to);
      clientFrom.setMonth(clientFrom.getMonth() - CLIENT_APPOINTMENT_LOOKBACK_MONTHS);
      const clientDocs = await runFirestoreQuery(
        'appointments',
        buildClientAppointmentsQuery(clientFrom.toISOString(), serviceId),
      );
      clientAppointmentRows = clientDocs.length;
      const trackMax = (map: Map<string, string>, key: string | null, iso: string) => {
        if (!key) return;
        const prev = map.get(key);
        if (!prev || iso > prev) map.set(key, iso);
      };
      for (const doc of clientDocs) {
        const iso = scheduledDateToIso(doc.data.scheduledDate);
        if (!iso) continue;
        const phoneKey = phoneLookupKey(
          typeof doc.data.clientPhone === 'string' ? doc.data.clientPhone : null,
        );
        const appUser =
          typeof doc.data.clientId === 'string' && doc.data.clientId.trim()
            ? doc.data.clientId.trim()
            : null;
        trackMax(lastAppointmentIndex.byPhoneKey, phoneKey, iso);
        trackMax(lastAppointmentIndex.byAppUser, appUser, iso);
      }
      lastAppointmentIndex = {
        ...lastAppointmentIndex,
        appointmentCount: clientAppointmentRows,
      };
    } catch (clientApptErr) {
      console.error('Firestore client appointments query failed', clientApptErr);
    }
    const activeThreshold = new Date(
      to.getTime() - ACTIVE_CLIENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    function resolveLastAppointment(entry: DirectoryRow): string | null {
      return resolveLastAppointmentFromIndex(entry, lastAppointmentIndex);
    }

    stage = 'aggregate_outbound';
    const outbound = rows.filter((row) => row.direction === 'outbound');
    const inbound = rows.filter((row) => row.direction === 'inbound');

    const byCampaign: Record<string, OutboundBucket> = {};
    const byTemplate: Record<string, OutboundBucket> = {};
    const byKind: { session: OutboundBucket; template: OutboundBucket } = {
      session: emptyBucket(),
      template: emptyBucket(),
    };

    for (const row of outbound) {
      const campaignKey = row.campaign_type || 'OTHER';
      byCampaign[campaignKey] ??= emptyBucket();
      accumulate(byCampaign[campaignKey], row.status);

      const isTemplate = !!row.template_name;
      if (isTemplate) {
        const tplKey = row.template_name as string;
        byTemplate[tplKey] ??= emptyBucket();
        accumulate(byTemplate[tplKey], row.status);
        accumulate(byKind.template, row.status);
      } else {
        accumulate(byKind.session, row.status);
      }
    }

    const totalSent = outbound.filter((row) =>
      ['sent', 'delivered', 'read'].includes(row.status),
    ).length;
    const totalDelivered = outbound.filter((row) => row.status === 'delivered').length;
    const totalRead = outbound.filter((row) => row.status === 'read').length;
    const reachedDevice = outbound.filter((row) =>
      ['delivered', 'read'].includes(row.status),
    ).length;
    const totalFailed = outbound.filter((row) => row.status === 'failed').length;
    const totalResponses = inbound.length;

    const outboundContacts = new Set(
      outbound
        .filter((row) => ['sent', 'delivered', 'read'].includes(row.status))
        .map((row) => row.conversation_stable_key)
        .filter((key): key is string => !!key),
    );
    const respondedContacts = new Set(
      inbound
        .map((row) => row.conversation_stable_key)
        .filter((key): key is string => !!key),
    );
    let respondedAndContacted = 0;
    for (const key of respondedContacts) {
      if (outboundContacts.has(key)) respondedAndContacted += 1;
    }
    const responseRate =
      outboundContacts.size > 0
        ? Math.round((respondedAndContacted / outboundContacts.size) * 1000) / 10
        : 0;

    stage = 'index_directory';
    const directoryByPhoneKey = new Map<string, DirectoryRow>();
    for (const entry of directoryRows) {
      const keys = new Set<string>();
      if (entry.phone_key) keys.add(entry.phone_key);
      const fromPhone = phoneLookupKey(entry.phone);
      if (fromPhone) keys.add(fromPhone);
      for (const k of keys) {
        if (!directoryByPhoneKey.has(k)) directoryByPhoneKey.set(k, entry);
      }
    }

    function resolveDirectory(stableKey: string | null): DirectoryRow | undefined {
      if (!stableKey) return undefined;
      const key = phoneLookupKey(stableKey);
      if (!key) return undefined;
      return directoryByPhoneKey.get(key);
    }

    stage = 'inbound_timeseries';
    const inboundByDay = new Map<string, PeopleBucket>();
    const inboundByWeek = new Map<string, PeopleBucket>();
    const inboundByMonth = new Map<string, PeopleBucket>();

    for (const row of inbound) {
      const day = bogotaDayKey(row.created_at);
      if (!day) continue;

      const stableKey = row.conversation_stable_key;
      const dir = stableKey ? resolveDirectory(stableKey) : undefined;
      // Excluir contactos TEST (admins/devs) de métricas inbound.
      if (
        dir &&
        isTestContact({
          classification: dir.classification,
          tags: asTagArray(dir.tags),
        })
      ) {
        continue;
      }

      const week = weekKeyFromDay(day);
      const month = monthKeyFromDay(day);
      ensurePeopleBucket(inboundByDay, day).messagesReceived += 1;
      ensurePeopleBucket(inboundByWeek, week).messagesReceived += 1;
      ensurePeopleBucket(inboundByMonth, month).messagesReceived += 1;

      if (!stableKey) continue;

      // Fecha de ingreso al CRM: first_contact_at (fallback created_at).
      // Nuevo = sin registro, sin fecha de ingreso, o ingreso en el bucket actual.
      // Existente = ya tenía fecha de ingreso anterior al bucket.
      const firstAt = dir?.first_contact_at ?? dir?.created_at ?? null;
      const firstDay = bogotaDayKey(firstAt);

      const classify = (bucketKey: string, kind: 'day' | 'week' | 'month') => {
        const bucket =
          kind === 'day'
            ? ensurePeopleBucket(inboundByDay, bucketKey)
            : kind === 'week'
              ? ensurePeopleBucket(inboundByWeek, bucketKey)
              : ensurePeopleBucket(inboundByMonth, bucketKey);
        if (bucket.people.has(stableKey)) return;
        bucket.people.add(stableKey);

        let isNew = true;
        if (firstDay) {
          if (kind === 'day') isNew = firstDay === bucketKey;
          else if (kind === 'week') isNew = weekKeyFromDay(firstDay) === bucketKey;
          else isNew = monthKeyFromDay(firstDay) === bucketKey;
        }

        if (isNew) bucket.newPeople.add(stableKey);
        else bucket.existingPeople.add(stableKey);
      };

      classify(day, 'day');
      classify(week, 'week');
      classify(month, 'month');
    }

    const periodStartKey = bogotaDayKey(from.toISOString()) ?? from.toISOString().slice(0, 10);
    const periodEndKey = bogotaDayKey(to.toISOString()) ?? to.toISOString().slice(0, 10);
    const allDays = eachDayInclusive(periodStartKey, periodEndKey);
    const allWeeks = [...new Set(allDays.map(weekKeyFromDay))].sort();
    const allMonths = [...new Set(allDays.map(monthKeyFromDay))].sort();

    const inboundTimeseries = {
      day: serializePeopleBuckets(inboundByDay, allDays),
      week: serializePeopleBuckets(inboundByWeek, allWeeks),
      month: serializePeopleBuckets(inboundByMonth, allMonths),
    };

    stage = 'client_segments';
    // Público de interés = directorio activo sin opt-out y sin tag TEST.
    const activeEntries = directoryRows.filter((e) => {
      const status = (e.status || 'active').toLowerCase();
      if (status !== 'active' || e.opt_out === true) return false;
      const tags = asTagArray(e.tags);
      return !isTestContact({ classification: e.classification, tags });
    });

    function isOnWhatsappBlocklist(entry: DirectoryRow): boolean {
      const candidates = [
        entry.phone_key,
        phoneLookupKey(entry.phone),
        entry.phone?.trim() || null,
      ];
      return candidates.some((k) => !!k && blocklistKeys.has(k));
    }

    function resolveBlocklistReason(entry: DirectoryRow): string | null {
      const candidates = [
        entry.phone_key,
        phoneLookupKey(entry.phone),
        entry.phone?.trim() || null,
      ];
      for (const k of candidates) {
        if (k && blocklistReasonByKey.has(k)) return blocklistReasonByKey.get(k) ?? null;
      }
      return null;
    }

    /** Marcadores técnicos en whatsapp_blocklist.reason (no son motivo humano). */
    const TECHNICAL_BLOCKLIST_REASONS = new Set([
      'directory_tag',
      'tag_blacklist',
      'inbox',
    ]);

    function humanBlacklistReason(entry: DirectoryRow): string | null {
      const notes =
        typeof entry.internal_notes === 'string' ? entry.internal_notes.trim() : '';
      if (notes) return notes;

      const fromBlocklist = resolveBlocklistReason(entry)?.trim() || null;
      if (fromBlocklist && !TECHNICAL_BLOCKLIST_REASONS.has(fromBlocklist.toLowerCase())) {
        return fromBlocklist;
      }
      return null;
    }

    // Cliente real = agendó ≥1 vez (cita Firebase).
    // Blacklist = tag Decline/🚫/Bloqueado O en whatsapp_blocklist (incluye no-clientes).
    // Activo/inactivo = clientes NO blacklisted, según ventana 30 días.
    // Motivo humano: crm_directory.internal_notes (prioridad); whatsapp_blocklist.reason
    // solo si no es token técnico (directory_tag / tag_blacklist / inbox).
    let clients = 0;
    let company = 0;
    let recurring = 0;
    let active = 0;
    let inactive = 0;
    let favorites = 0;
    let blacklist = 0;
    const directoryClients = activeEntries.map((e) => {
      const tags = asTagArray(e.tags);
      const classifiable = { classification: e.classification, tags };
      const isCompany = isCompanyClient(classifiable);
      const isRecurring = isRecurringClient(classifiable);
      const isAgendado = hasAgendadoTag(classifiable);
      const isFavorite = hasFavoritosTag(classifiable);
      const taggedBlacklist = hasBlacklistTag(classifiable);
      const blockedInInbox = isOnWhatsappBlocklist(e);
      const isBlacklisted = taggedBlacklist || blockedInInbox;

      const lastAppointmentDate = resolveLastAppointment(e);
      const isClient = lastAppointmentDate !== null;
      // Blacklisted clients leave the active/inactive buckets.
      const isActive =
        isClient && !isBlacklisted && lastAppointmentDate! >= activeThreshold;
      const isInactive = isClient && !isBlacklisted && !isActive;

      const blacklistReason = isBlacklisted ? humanBlacklistReason(e) : null;

      if (isClient) clients += 1;
      if (isClient && isCompany) company += 1;
      if (isClient && isRecurring) recurring += 1;
      if (isActive) active += 1;
      if (isInactive) inactive += 1;
      if (isFavorite) favorites += 1;
      if (isBlacklisted) blacklist += 1;

      return {
        id: e.id,
        name: e.display_name || e.full_name,
        phone: e.phone,
        classification: e.classification,
        tags,
        isCompany,
        isRecurring,
        isAgendado,
        isFavorite,
        isClient,
        isActive,
        isBlacklisted,
        blacklistReason,
        lastAppointmentDate,
      };
    });

    const clientSegments = {
      total: activeEntries.length,
      clients,
      company,
      recurring,
      active,
      inactive,
      favorites,
      blacklist,
    };

    stage = 'completed_timeseries';
    const completedByDay = new Map<string, number>();
    const completedByWeek = new Map<string, number>();
    const completedByMonth = new Map<string, number>();
    for (const appt of appointmentRows) {
      const day = bogotaDayKey(appt.scheduled_date);
      if (!day) continue;
      const week = weekKeyFromDay(day);
      const month = monthKeyFromDay(day);
      completedByDay.set(day, (completedByDay.get(day) ?? 0) + 1);
      completedByWeek.set(week, (completedByWeek.get(week) ?? 0) + 1);
      completedByMonth.set(month, (completedByMonth.get(month) ?? 0) + 1);
    }

    const completedStartKey =
      bogotaDayKey(completedFrom.toISOString()) ?? completedFrom.toISOString().slice(0, 10);
    const completedEndKey = bogotaDayKey(to.toISOString()) ?? to.toISOString().slice(0, 10);
    const completedDays = eachDayInclusive(completedStartKey, completedEndKey);
    const completedWeeks = [...new Set(completedDays.map(weekKeyFromDay))].sort();
    const completedMonths = [...new Set(completedDays.map(monthKeyFromDay))].sort();

    // Día: solo buckets con datos (evita 180 días vacíos). Semana/mes: serie completa.
    const completedDayPoints = [...completedByDay.entries()]
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, completed]) => ({ bucket, completed }));

    const completedServicesTimeseries = {
      day: completedDayPoints,
      week: completedWeeks.map((bucket) => ({
        bucket,
        completed: completedByWeek.get(bucket) ?? 0,
      })),
      month: completedMonths.map((bucket) => ({
        bucket,
        completed: completedByMonth.get(bucket) ?? 0,
      })),
    };

    const lastCompletedDate =
      completedDayPoints.length > 0
        ? completedDayPoints[completedDayPoints.length - 1].bucket
        : null;
    const completedInSelectedPeriod = appointmentRows.filter((appt) => {
      const day = bogotaDayKey(appt.scheduled_date);
      return day != null && day >= periodStartKey && day <= periodEndKey;
    }).length;

    // Detalle inspectable de citas COMPLETED (drill-down en el front), más reciente primero.
    const completedAppointments = appointmentRows
      .filter((appt) => appt.scheduled_date != null)
      .map((appt) => ({
        id: appt.id,
        scheduledDate: appt.scheduled_date as string,
        clientName: appt.clientName,
        clientPhone: appt.clientPhone,
        providerName: appt.providerName,
        teamMemberId: appt.teamMemberId,
        duration: appt.duration,
        totalAmount: appt.totalAmount,
        paidAmount: appt.paidAmount,
        pendingAmount: appt.pendingAmount,
        paymentStatus: appt.paymentStatus,
        addressLine: appt.addressLine,
        serviceTitle: appt.serviceTitle,
      }))
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));

    // Comparaciones justas (Bogotá): no tratar mes/30d en curso como periodo cerrado.
    const todayKey = periodEndKey;
    const [todayYear, todayMonth, todayDom] = todayKey.split('-').map(Number);
    const currentMonthKey = `${todayYear}-${String(todayMonth).padStart(2, '0')}`;
    const currentMonthStart = `${currentMonthKey}-01`;

    // MTD: 1..hoy del mes actual vs 1..mismo día del mes anterior (clamp fin de mes).
    const prevMonthKey = addMonthsToKey(currentMonthKey, -1);
    const [prevMonthYear, prevMonthNum] = prevMonthKey.split('-').map(Number);
    const prevMonthDayCount = new Date(Date.UTC(prevMonthYear, prevMonthNum, 0)).getUTCDate();
    const prevMonthSameDom = Math.min(todayDom, prevMonthDayCount);
    const mtd = buildComparison(
      sumCompletedInRange(completedByDay, currentMonthStart, todayKey),
      sumCompletedInRange(
        completedByDay,
        `${prevMonthKey}-01`,
        `${prevMonthKey}-${String(prevMonthSameDom).padStart(2, '0')}`,
      ),
    );

    // Rolling 30d: [hoy-29, hoy] vs [hoy-59, hoy-30].
    const rolling30Start = addDaysToKey(todayKey, -29);
    const prev30End = addDaysToKey(rolling30Start, -1);
    const prev30Start = addDaysToKey(prev30End, -29);
    const rolling30d = buildComparison(
      sumCompletedInRange(completedByDay, rolling30Start, todayKey),
      sumCompletedInRange(completedByDay, prev30Start, prev30End),
    );

    // Último mes calendario cerrado vs el anterior (solo si ambos caben completos en la ventana).
    const windowStartMonth = completedStartKey.slice(0, 7);
    const lastClosedMonthKey = addMonthsToKey(currentMonthKey, -1);
    const prevClosedMonthKey = addMonthsToKey(currentMonthKey, -2);
    const lastClosedMonth =
      prevClosedMonthKey > windowStartMonth
        ? {
            month: lastClosedMonthKey,
            ...buildComparison(
              completedByMonth.get(lastClosedMonthKey) ?? 0,
              completedByMonth.get(prevClosedMonthKey) ?? 0,
            ),
          }
        : null;

    const optOutCount = directoryRows.filter((e) => e.opt_out === true).length;

    stage = 'response';
    return jsonResponse({
      period: { from: from.toISOString(), to: to.toISOString() },
      totalSent,
      totalDelivered,
      totalRead,
      reachedDevice,
      totalFailed,
      totalResponses,
      responseRate,
      uniqueContactsMessaged: outboundContacts.size,
      uniqueContactsResponded: respondedAndContacted,
      optOutCount,
      byCampaign,
      byTemplate,
      byKind,
      leads: {
        total: directoryRows.length,
        enSeguimiento: directoryRows.filter((e) => e.active_sequence === 'SEGUIMIENTO').length,
        enRebooking: directoryRows.filter((e) => e.active_sequence === 'REBOOKING').length,
        optOut: optOutCount,
        agendados: directoryRows.filter((e) => (e.pending_appointments_count ?? 0) > 0).length,
      },
      inboundTimeseries,
      clientSegments,
      directoryClients,
      completedServicesTimeseries,
      completedAppointments,
      completedMeta: {
        windowMonths: 6,
        windowFrom: completedFrom.toISOString(),
        windowTo: to.toISOString(),
        totalCompleted: appointmentRows.length,
        inSelectedPeriod: completedInSelectedPeriod,
        lastCompletedDate,
        today: todayKey,
        currentMonth: currentMonthKey,
        comparisons: {
          mtd,
          rolling30d,
          lastClosedMonth,
        },
      },
      dataQuality: {
        messageLogRows: rows.length,
        directoryRows: directoryRows.length,
        appointmentRows: appointmentRows.length,
        clientAppointmentRows,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = `[${stage}] ${errorMessage(error)}`;
    console.error('get-whatsapp-metrics failed', message, error);
    return jsonResponse({ error: message, stage }, 500);
  }
});

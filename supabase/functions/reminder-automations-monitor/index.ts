/**
 * reminder-automations-monitor
 *
 * Panel de solo lectura para el pipeline de recordatorios WhatsApp 24h:
 * cruza citas en Firestore (appointments) con whatsapp_message_log.
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { requireDirectoryAdmin } from '../_shared/directoryMonitorAuth.ts';
import {
  getFirestoreUserPhone,
  runFirestoreQuery,
} from '../_shared/firebaseAdminRest.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const COLOMBIA_UTC_OFFSET_HOURS = -5;
const TIMEZONE = 'America/Bogota';
const TEMPLATE_CLIENT = 'recordatorio_cita_24h';
const TEMPLATE_PROFESSIONAL = 'recordatorio_profesional_24h';

type RecipientType = 'client' | 'professional';

export type ReminderDeliveryStatus =
  | 'pending'
  | 'ready'
  | 'missing_phone'
  | 'missing_professional'
  | 'sent'
  | 'failed'
  | 'sent_unverified'
  | 'skipped';

export interface ReminderRow {
  appointmentId: string;
  recipientType: RecipientType;
  recipientName: string;
  phone: string | null;
  phoneMasked: string | null;
  scheduledDate: string | null;
  appointmentStatus: string;
  deliveryStatus: ReminderDeliveryStatus;
  sentAt: string | null;
  templateName: string;
  waMessageId: string | null;
  logStatus: string | null;
  logCreatedAt: string | null;
  logErrorMessage: string | null;
  messageBody: string | null;
  conversationStableKey: string | null;
  address: string | null;
  professionalName: string | null;
  clientName: string | null;
}

export interface ReminderAutomationsDashboard {
  meta: {
    timezone: typeof TIMEZONE;
    nextSchedulerRunAt: string;
    lastSchedulerRunAt: string;
    lastBatchRunAt: string;
    upcomingServiceDate: string;
    lastRunServiceDate: string;
    beforeNextSchedulerRun: boolean;
  };
  clients: { upcoming: ReminderRow[]; lastRun: ReminderRow[] };
  professionals: { upcoming: ReminderRow[]; lastRun: ReminderRow[] };
  summary: Record<ReminderDeliveryStatus, number>;
}

// ── Fechas Colombia (alineado con sendWhatsAppAppointmentReminders) ─────────

function getColombiaDate(now: Date): { year: number; month: number; day: number } {
  const colombiaOffsetMs = COLOMBIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const colombiaMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000 + colombiaOffsetMs;
  const d = new Date(colombiaMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function colombiaMidnightUtc(dayOffset: number, now = new Date()): Date {
  const col = getColombiaDate(now);
  return new Date(Date.UTC(col.year, col.month, col.day + dayOffset, 5, 0, 0, 0));
}

function colombiaSchedulerRunUtc(dayOffset: number, now = new Date()): Date {
  const col = getColombiaDate(now);
  return new Date(Date.UTC(col.year, col.month, col.day + dayOffset, 23, 0, 0, 0));
}

function formatColombiaDateKey(date: Date): string {
  const col = getColombiaDate(date);
  const y = col.year;
  const m = String(col.month + 1).padStart(2, '0');
  const d = String(col.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildMeta(now = new Date()) {
  const todayRun = colombiaSchedulerRunUtc(0, now);
  const nowMs = now.getTime();
  const beforeNextSchedulerRun = nowMs < todayRun.getTime();
  const nextSchedulerRunAt = beforeNextSchedulerRun
    ? todayRun
    : colombiaSchedulerRunUtc(1, now);
  const lastSchedulerRunAt = beforeNextSchedulerRun
    ? colombiaSchedulerRunUtc(-1, now)
    : todayRun;
  const lastBatchRunAt = colombiaSchedulerRunUtc(-1, now);

  return {
    timezone: TIMEZONE as typeof TIMEZONE,
    nextSchedulerRunAt: nextSchedulerRunAt.toISOString(),
    lastSchedulerRunAt: lastSchedulerRunAt.toISOString(),
    lastBatchRunAt: lastBatchRunAt.toISOString(),
    upcomingServiceDate: formatColombiaDateKey(colombiaMidnightUtc(1, now)),
    lastRunServiceDate: formatColombiaDateKey(colombiaMidnightUtc(0, now)),
    beforeNextSchedulerRun,
  };
}

// ── Firestore query helpers ─────────────────────────────────────────────────

function timestampValue(iso: string) {
  return { timestampValue: iso };
}

function buildAppointmentsQuery(startIso: string, endIso: string, withStatusFilter: boolean) {
  const filters: Record<string, unknown>[] = [
    {
      fieldFilter: {
        field: { fieldPath: 'scheduledDate' },
        op: 'GREATER_THAN_OR_EQUAL',
        value: timestampValue(startIso),
      },
    },
    {
      fieldFilter: {
        field: { fieldPath: 'scheduledDate' },
        op: 'LESS_THAN',
        value: timestampValue(endIso),
      },
    },
  ];

  if (withStatusFilter) {
    filters.unshift({
      fieldFilter: {
        field: { fieldPath: 'status' },
        op: 'IN',
        value: {
          arrayValue: {
            values: [{ stringValue: 'PENDING' }, { stringValue: 'CONFIRMED' }],
          },
        },
      },
    });
  }

  return {
    where: {
      compositeFilter: { op: 'AND', filters },
    },
  };
}

async function fetchAppointmentsInRange(
  startIso: string,
  endIso: string,
  withStatusFilter: boolean,
) {
  return runFirestoreQuery(
    'appointments',
    buildAppointmentsQuery(startIso, endIso, withStatusFilter),
  );
}

function parseTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return null;
}

function getAppointmentAddress(data: Record<string, unknown>): string | null {
  const serviceAddress = data.serviceAddress as Record<string, unknown> | undefined;
  if (serviceAddress?.addressLine && typeof serviceAddress.addressLine === 'string') {
    return serviceAddress.addressLine;
  }
  const location = data.location as Record<string, unknown> | undefined;
  if (location?.address && typeof location.address === 'string') {
    return location.address;
  }
  return null;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\d(?=\d{4})/g, '*');
}

// ── Logs Supabase ───────────────────────────────────────────────────────────

interface MessageLogRow {
  id: string;
  template_name: string | null;
  status: string;
  wa_message_id: string | null;
  created_at: string;
  error_message: string | null;
  message_body: string | null;
  conversation_stable_key: string;
  raw_payload: Record<string, unknown> | null;
}

type LogMap = Map<string, MessageLogRow>;

function logMapKey(appointmentId: string, recipientType: RecipientType): string {
  return `${appointmentId}:${recipientType}`;
}

async function fetchReminderLogs(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<LogMap> {
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select(
      'id, template_name, status, wa_message_id, created_at, error_message, message_body, conversation_stable_key, raw_payload',
    )
    .in('template_name', [TEMPLATE_CLIENT, TEMPLATE_PROFESSIONAL])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });

  if (error) throw new Error(formatError(error));

  const map: LogMap = new Map();
  for (const row of (data ?? []) as MessageLogRow[]) {
    const payload = row.raw_payload ?? {};
    if (payload.source !== 'reminder_scheduler') continue;
    const appointmentId = String(payload.appointment_id ?? '').trim();
    const recipientType = payload.recipient_type as RecipientType | undefined;
    if (!appointmentId || !recipientType) continue;
    const key = logMapKey(appointmentId, recipientType);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

// ── Estado por fila ─────────────────────────────────────────────────────────

async function resolveClientPhone(data: Record<string, unknown>): Promise<string | null> {
  const direct = String(data.clientPhone ?? '').trim();
  if (direct) return direct;
  const uid = String(data.clientAppUserId ?? data.clientId ?? '').trim();
  return getFirestoreUserPhone(uid || null);
}

async function resolveProfessionalPhone(data: Record<string, unknown>): Promise<{
  phone: string | null;
  missingProfessional: boolean;
}> {
  const uid = String(data.teamMemberId ?? data.providerId ?? '').trim();
  if (!uid) return { phone: null, missingProfessional: true };
  const phone = await getFirestoreUserPhone(uid);
  return { phone, missingProfessional: false };
}

function resolveDeliveryStatus(params: {
  recipientType: RecipientType;
  section: 'upcoming' | 'lastRun';
  appointmentStatus: string;
  sentAt: string | null;
  phone: string | null;
  missingProfessional: boolean;
  log: MessageLogRow | undefined;
  meta: ReturnType<typeof buildMeta>;
}): ReminderDeliveryStatus {
  const status = params.appointmentStatus.toUpperCase();
  if (params.section === 'lastRun' && ['CANCELLED', 'CANCELED', 'REJECTED'].includes(status)) {
    return 'skipped';
  }

  if (params.recipientType === 'professional' && params.missingProfessional) {
    return 'missing_professional';
  }

  if (!params.phone) {
    return 'missing_phone';
  }

  const logFailed = params.log?.status === 'failed';
  const logSent = params.log?.status === 'sent';
  const hasSentAt = Boolean(params.sentAt);

  if (hasSentAt && logSent) return 'sent';
  if (hasSentAt && !params.log) return 'sent_unverified';
  if (logFailed) return 'failed';

  if (params.section === 'lastRun') {
    const batchPassed = Date.now() > new Date(params.meta.lastBatchRunAt).getTime() + 5 * 60_000;
    if (!hasSentAt && batchPassed) return 'failed';
    if (hasSentAt && logSent) return 'sent';
    if (hasSentAt) return 'sent_unverified';
    return batchPassed ? 'failed' : 'pending';
  }

  if (!params.meta.beforeNextSchedulerRun) {
    if (!hasSentAt) return 'failed';
  }

  if (['PENDING', 'CONFIRMED'].includes(status)) {
    return 'ready';
  }

  return 'pending';
}

async function buildReminderRow(
  doc: { id: string; data: Record<string, unknown> },
  recipientType: RecipientType,
  section: 'upcoming' | 'lastRun',
  logMap: LogMap,
  meta: ReturnType<typeof buildMeta>,
): Promise<ReminderRow> {
  const data = doc.data;
  const appointmentId = doc.id;
  const appointmentStatus = String(data.status ?? 'UNKNOWN');
  const clientName = String(data.clientName ?? 'Cliente');
  const professionalName = String(data.providerName ?? 'Profesional');
  const scheduledDate = parseTimestamp(data.scheduledDate);
  const sentAtField = recipientType === 'client'
    ? 'recordatorio24hSentAt'
    : 'recordatorioProfesionalSentAt';
  const sentAt = parseTimestamp(data[sentAtField]);
  const templateName = recipientType === 'client' ? TEMPLATE_CLIENT : TEMPLATE_PROFESSIONAL;

  let phone: string | null = null;
  let missingProfessional = false;
  if (recipientType === 'client') {
    phone = await resolveClientPhone(data);
  } else {
    const resolved = await resolveProfessionalPhone(data);
    phone = resolved.phone;
    missingProfessional = resolved.missingProfessional;
  }

  const log = logMap.get(logMapKey(appointmentId, recipientType));
  const deliveryStatus = resolveDeliveryStatus({
    recipientType,
    section,
    appointmentStatus,
    sentAt,
    phone,
    missingProfessional,
    log,
    meta,
  });

  const recipientName = recipientType === 'client' ? clientName : professionalName;

  return {
    appointmentId,
    recipientType,
    recipientName,
    phone,
    phoneMasked: maskPhone(phone),
    scheduledDate,
    appointmentStatus,
    deliveryStatus,
    sentAt,
    templateName,
    waMessageId: log?.wa_message_id ?? null,
    logStatus: log?.status ?? null,
    logCreatedAt: log?.created_at ?? null,
    logErrorMessage: log?.error_message ?? null,
    messageBody: log?.message_body ?? null,
    conversationStableKey: log?.conversation_stable_key ?? null,
    address: getAppointmentAddress(data),
    professionalName,
    clientName,
  };
}

function emptySummary(): Record<ReminderDeliveryStatus, number> {
  return {
    pending: 0,
    ready: 0,
    missing_phone: 0,
    missing_professional: 0,
    sent: 0,
    failed: 0,
    sent_unverified: 0,
    skipped: 0,
  };
}

function accumulateSummary(
  summary: Record<ReminderDeliveryStatus, number>,
  rows: ReminderRow[],
) {
  for (const row of rows) {
    summary[row.deliveryStatus] = (summary[row.deliveryStatus] ?? 0) + 1;
  }
}

async function buildDashboard(supabase: SupabaseClient): Promise<ReminderAutomationsDashboard> {
  const now = new Date();
  const meta = buildMeta(now);

  const upcomingStart = colombiaMidnightUtc(1, now).toISOString();
  const upcomingEnd = colombiaMidnightUtc(2, now).toISOString();
  const lastRunStart = colombiaMidnightUtc(0, now).toISOString();
  const lastRunEnd = colombiaMidnightUtc(1, now).toISOString();

  const [upcomingDocs, lastRunDocs, logMap] = await Promise.all([
    fetchAppointmentsInRange(upcomingStart, upcomingEnd, true),
    fetchAppointmentsInRange(lastRunStart, lastRunEnd, false),
    fetchReminderLogs(supabase, meta.lastBatchRunAt),
  ]);

  const clientsUpcoming: ReminderRow[] = [];
  const clientsLastRun: ReminderRow[] = [];
  const professionalsUpcoming: ReminderRow[] = [];
  const professionalsLastRun: ReminderRow[] = [];

  for (const doc of upcomingDocs) {
    clientsUpcoming.push(await buildReminderRow(doc, 'client', 'upcoming', logMap, meta));
    professionalsUpcoming.push(
      await buildReminderRow(doc, 'professional', 'upcoming', logMap, meta),
    );
  }

  for (const doc of lastRunDocs) {
    clientsLastRun.push(await buildReminderRow(doc, 'client', 'lastRun', logMap, meta));
    professionalsLastRun.push(
      await buildReminderRow(doc, 'professional', 'lastRun', logMap, meta),
    );
  }

  const summary = emptySummary();
  for (const rows of [
    clientsUpcoming,
    clientsLastRun,
    professionalsUpcoming,
    professionalsLastRun,
  ]) {
    accumulateSummary(summary, rows);
  }

  return {
    meta,
    clients: { upcoming: clientsUpcoming, lastRun: clientsLastRun },
    professionals: { upcoming: professionalsUpcoming, lastRun: professionalsLastRun },
    summary,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireDirectoryAdmin(req);

    if (req.method === 'GET') {
      return jsonResponse(await buildDashboard(supabase));
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'dashboard').trim();

    if (action === 'dashboard') {
      return jsonResponse(await buildDashboard(supabase));
    }

    return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});

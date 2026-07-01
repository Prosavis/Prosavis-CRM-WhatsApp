/**
 * Construcción del dashboard y filas de recordatorios 24h (monitor + snapshots).
 */

import { formatError } from './errors.ts';
import { jsonResponse } from './cors.ts';
import { jsonResponse } from './cors.ts';
import {
  resolveClientPhoneForAppointment,
  resolveProfessionalPhoneForAppointment,
} from './appointmentPhoneResolver.ts';
import { normalizeDirectoryPhoneE164 } from './directoryPhone.ts';
import { resolveRecipientKey, type RecipientType } from './reminderRecipientKey.ts';
import {
  getFirestoreDocument,
  patchFirestoreDocument,
  runFirestoreQuery,
} from './firebaseAdminRest.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const COLOMBIA_UTC_OFFSET_HOURS = -5;
const TIMEZONE = 'America/Bogota';
const TEMPLATE_CLIENT = 'recordatorio_cita_24h';
const TEMPLATE_PROFESSIONAL = 'recordatorio_profesional_24h';

export type ReminderDeliveryStatus =
  | 'pending'
  | 'ready'
  | 'missing_phone'
  | 'missing_professional'
  | 'sent'
  | 'failed'
  | 'sent_unverified'
  | 'skipped'
  | 'not_attempted'
  | 'disabled';

export interface ReminderRow {
  appointmentId: string;
  recipientType: RecipientType;
  recipientKey: string | null;
  recipientName: string;
  phone: string | null;
  phoneMasked: string | null;
  scheduledDate: string | null;
  appointmentStatus: string;
  deliveryStatus: ReminderDeliveryStatus;
  remindersEnabled: boolean;
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
  failureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
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

export type RecipientPreferenceMap = Map<string, boolean>;

function preferenceMapKey(recipientKey: string, recipientType: RecipientType): string {
  return `${recipientType}:${recipientKey}`;
}

export async function loadRecipientPreferences(
  supabase: SupabaseClient,
  keys: Array<{ recipientKey: string; recipientType: RecipientType }>,
): Promise<RecipientPreferenceMap> {
  const map: RecipientPreferenceMap = new Map();
  if (keys.length === 0) return map;

  const unique = new Map<string, RecipientType>();
  for (const { recipientKey, recipientType } of keys) {
    if (recipientKey) unique.set(recipientKey, recipientType);
  }

  const clientKeys = [...unique.entries()]
    .filter(([, t]) => t === 'client')
    .map(([k]) => k);
  const professionalKeys = [...unique.entries()]
    .filter(([, t]) => t === 'professional')
    .map(([k]) => k);

  const queries: Promise<void>[] = [];

  if (clientKeys.length > 0) {
    queries.push(
      (async () => {
        const { data, error } = await supabase
          .from('reminder_recipient_preferences')
          .select('recipient_key, reminders_enabled')
          .eq('recipient_type', 'client')
          .in('recipient_key', clientKeys);
        if (error) throw new Error(formatError(error));
        for (const row of data ?? []) {
          map.set(
            preferenceMapKey(String(row.recipient_key), 'client'),
            Boolean(row.reminders_enabled),
          );
        }
      })(),
    );
  }

  if (professionalKeys.length > 0) {
    queries.push(
      (async () => {
        const { data, error } = await supabase
          .from('reminder_recipient_preferences')
          .select('recipient_key, reminders_enabled')
          .eq('recipient_type', 'professional')
          .in('recipient_key', professionalKeys);
        if (error) throw new Error(formatError(error));
        for (const row of data ?? []) {
          map.set(
            preferenceMapKey(String(row.recipient_key), 'professional'),
            Boolean(row.reminders_enabled),
          );
        }
      })(),
    );
  }

  await Promise.all(queries);
  return map;
}

function getRemindersEnabled(
  prefs: RecipientPreferenceMap,
  recipientKey: string | null,
  recipientType: RecipientType,
): boolean {
  if (!recipientKey) return true;
  const key = preferenceMapKey(recipientKey, recipientType);
  if (!prefs.has(key)) return true;
  return prefs.get(key) ?? true;
}

function getColombiaDate(now: Date): { year: number; month: number; day: number } {
  const colombiaOffsetMs = COLOMBIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const colombiaMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000 + colombiaOffsetMs;
  const d = new Date(colombiaMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function colombiaMidnightUtc(dayOffset: number, now = new Date()): Date {
  const col = getColombiaDate(now);
  return new Date(Date.UTC(col.year, col.month, col.day + dayOffset, 5, 0, 0, 0));
}

function colombiaSchedulerRunUtc(dayOffset: number, now = new Date()): Date {
  const col = getColombiaDate(now);
  return new Date(Date.UTC(col.year, col.month, col.day + dayOffset, 23, 0, 0, 0));
}

export function formatColombiaDateKey(date: Date): string {
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

interface AppointmentPhoneIndex {
  client: Map<string, MessageLogRow>;
  professional: Map<string, MessageLogRow>;
}

function normalizeLogPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return normalizeDirectoryPhoneE164(phone) ?? phone.replace(/\D/g, '');
}

function logMapKey(appointmentId: string, recipientType: RecipientType): string {
  return `${appointmentId}:${recipientType}`;
}

async function fetchReminderLogs(
  supabase: SupabaseClient,
  sinceIso: string,
): Promise<{ byAppointment: LogMap; byPhone: AppointmentPhoneIndex }> {
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select(
      'id, template_name, status, wa_message_id, created_at, error_message, message_body, conversation_stable_key, raw_payload, recipient_phone',
    )
    .in('template_name', [TEMPLATE_CLIENT, TEMPLATE_PROFESSIONAL])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });

  if (error) throw new Error(formatError(error));

  const byAppointment: LogMap = new Map();
  const byPhone: AppointmentPhoneIndex = {
    client: new Map(),
    professional: new Map(),
  };

  for (const row of (data ?? []) as (MessageLogRow & { recipient_phone?: string | null })[]) {
    const payload = row.raw_payload ?? {};
    if (payload.source !== 'reminder_scheduler') continue;

    const appointmentId = String(payload.appointment_id ?? '').trim();
    const recipientType = payload.recipient_type as RecipientType | undefined;

    if (appointmentId && recipientType) {
      const key = logMapKey(appointmentId, recipientType);
      if (!byAppointment.has(key)) byAppointment.set(key, row);
    }

    const phoneKey = normalizeLogPhone(row.recipient_phone);
    const template = row.template_name;
    if (phoneKey && template) {
      const kind: RecipientType | null =
        template === TEMPLATE_CLIENT
          ? 'client'
          : template === TEMPLATE_PROFESSIONAL
            ? 'professional'
            : null;
      if (kind && !byPhone[kind].has(phoneKey)) {
        byPhone[kind].set(phoneKey, row);
      }
    }
  }

  return { byAppointment, byPhone };
}

function resolveLogForRow(
  appointmentId: string,
  recipientType: RecipientType,
  phone: string | null,
  logMaps: { byAppointment: LogMap; byPhone: AppointmentPhoneIndex },
): MessageLogRow | undefined {
  const direct = logMaps.byAppointment.get(logMapKey(appointmentId, recipientType));
  if (direct) return direct;

  const phoneKey = normalizeLogPhone(phone);
  if (!phoneKey) return undefined;
  return logMaps.byPhone[recipientType].get(phoneKey);
}

function readRecipientTrackingFields(
  data: Record<string, unknown>,
  recipientType: RecipientType,
): {
  lastError: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
} {
  if (recipientType === 'client') {
    return {
      lastError: String(data.recordatorio24hLastError ?? '').trim() || null,
      attemptCount: Number(data.recordatorio24hAttemptCount ?? 0) || 0,
      lastAttemptAt: parseTimestamp(data.recordatorio24hLastAttemptAt),
    };
  }
  return {
    lastError: String(data.recordatorioProfesionalLastError ?? '').trim() || null,
    attemptCount: Number(data.recordatorioProfesionalAttemptCount ?? 0) || 0,
    lastAttemptAt: parseTimestamp(data.recordatorioProfesionalLastAttemptAt),
  };
}

function resolveFailureReason(params: {
  log: MessageLogRow | undefined;
  lastError: string | null;
  deliveryStatus: ReminderDeliveryStatus;
}): string | null {
  if (params.deliveryStatus === 'disabled') {
    return 'Recordatorio desactivado por administrador';
  }
  if (params.log?.error_message) return params.log.error_message;
  if (params.lastError) return params.lastError;
  if (params.deliveryStatus === 'not_attempted') {
    return 'No se registró intento en el batch de las 6 PM';
  }
  if (params.deliveryStatus === 'failed') {
    return 'Fallo de envío sin detalle registrado';
  }
  return null;
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
  lastError: string | null;
  lastAttemptAt: string | null;
  remindersEnabled: boolean;
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

  if (!params.remindersEnabled) {
    return 'disabled';
  }

  const logFailed = params.log?.status === 'failed';
  const logSent = params.log?.status === 'sent';
  const hasSentAt = Boolean(params.sentAt);
  const hasAttempt = Boolean(params.lastAttemptAt) || (params.lastError?.length ?? 0) > 0;

  if (hasSentAt && logSent) return 'sent';
  if (hasSentAt && !params.log) return 'sent_unverified';
  if (logFailed) return 'failed';

  if (params.section === 'lastRun') {
    const batchPassed = Date.now() > new Date(params.meta.lastBatchRunAt).getTime() + 5 * 60_000;
    if (!hasSentAt && batchPassed && !hasAttempt && !params.log) return 'not_attempted';
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
  logMaps: { byAppointment: LogMap; byPhone: AppointmentPhoneIndex },
  meta: ReturnType<typeof buildMeta>,
  supabase: SupabaseClient,
  prefs: RecipientPreferenceMap,
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
  const tracking = readRecipientTrackingFields(data, recipientType);
  const recipientKey = await resolveRecipientKey(supabase, data, recipientType);
  const remindersEnabled = getRemindersEnabled(prefs, recipientKey, recipientType);

  let phone: string | null = null;
  let missingProfessional = false;
  if (recipientType === 'client') {
    phone = await resolveClientPhoneForAppointment(supabase, data);
  } else {
    const resolved = await resolveProfessionalPhoneForAppointment(data);
    phone = resolved.phone;
    missingProfessional = resolved.missingProfessional;
  }

  const log = resolveLogForRow(appointmentId, recipientType, phone, logMaps);
  const deliveryStatus = resolveDeliveryStatus({
    recipientType,
    section,
    appointmentStatus,
    sentAt,
    phone,
    missingProfessional,
    log,
    meta,
    lastError: tracking.lastError,
    lastAttemptAt: tracking.lastAttemptAt,
    remindersEnabled,
  });

  const failureReason = resolveFailureReason({
    log,
    lastError: tracking.lastError,
    deliveryStatus,
  });

  const recipientName = recipientType === 'client' ? clientName : professionalName;

  return {
    appointmentId,
    recipientType,
    recipientKey,
    recipientName,
    phone,
    phoneMasked: phone,
    scheduledDate,
    appointmentStatus,
    deliveryStatus,
    remindersEnabled,
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
    failureReason,
    attemptCount: tracking.attemptCount,
    lastAttemptAt: tracking.lastAttemptAt,
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
    not_attempted: 0,
    disabled: 0,
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

async function buildRowsForDocs(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
  section: 'upcoming' | 'lastRun',
  logMaps: { byAppointment: LogMap; byPhone: AppointmentPhoneIndex },
  meta: ReturnType<typeof buildMeta>,
  supabase: SupabaseClient,
  prefs: RecipientPreferenceMap,
): Promise<{ clients: ReminderRow[]; professionals: ReminderRow[] }> {
  const clients: ReminderRow[] = [];
  const professionals: ReminderRow[] = [];

  for (const doc of docs) {
    clients.push(
      await buildReminderRow(doc, 'client', section, logMaps, meta, supabase, prefs),
    );
    professionals.push(
      await buildReminderRow(doc, 'professional', section, logMaps, meta, supabase, prefs),
    );
  }

  return { clients, professionals };
}

async function collectPrefsForDocs(
  supabase: SupabaseClient,
  docs: Array<{ id: string; data: Record<string, unknown> }>,
): Promise<RecipientPreferenceMap> {
  const keys: Array<{ recipientKey: string; recipientType: RecipientType }> = [];
  for (const doc of docs) {
    for (const recipientType of ['client', 'professional'] as RecipientType[]) {
      const recipientKey = await resolveRecipientKey(supabase, doc.data, recipientType);
      if (recipientKey) keys.push({ recipientKey, recipientType });
    }
  }
  return loadRecipientPreferences(supabase, keys);
}

export async function buildDashboard(supabase: SupabaseClient): Promise<ReminderAutomationsDashboard> {
  const now = new Date();
  const meta = buildMeta(now);

  const upcomingStart = colombiaMidnightUtc(1, now).toISOString();
  const upcomingEnd = colombiaMidnightUtc(2, now).toISOString();
  const lastRunStart = colombiaMidnightUtc(0, now).toISOString();
  const lastRunEnd = colombiaMidnightUtc(1, now).toISOString();

  const logSince = new Date(
    new Date(meta.lastBatchRunAt).getTime() - 2 * 60 * 60 * 1000,
  ).toISOString();

  const [upcomingDocs, lastRunDocs, logMaps] = await Promise.all([
    fetchAppointmentsInRange(upcomingStart, upcomingEnd, true),
    fetchAppointmentsInRange(lastRunStart, lastRunEnd, false),
    fetchReminderLogs(supabase, logSince),
  ]);

  const allDocs = [...upcomingDocs, ...lastRunDocs];
  const prefs = await collectPrefsForDocs(supabase, allDocs);

  const upcoming = await buildRowsForDocs(
    upcomingDocs,
    'upcoming',
    logMaps,
    meta,
    supabase,
    prefs,
  );
  const lastRun = await buildRowsForDocs(
    lastRunDocs,
    'lastRun',
    logMaps,
    meta,
    supabase,
    prefs,
  );

  const summary = emptySummary();
  for (const rows of [
    upcoming.clients,
    upcoming.professionals,
    lastRun.clients,
    lastRun.professionals,
  ]) {
    accumulateSummary(summary, rows);
  }

  return {
    meta,
    clients: { upcoming: upcoming.clients, lastRun: lastRun.clients },
    professionals: { upcoming: upcoming.professionals, lastRun: lastRun.professionals },
    summary,
  };
}

export async function buildSnapshotRowsForServiceDate(
  supabase: SupabaseClient,
  serviceDate: string,
): Promise<ReminderRow[]> {
  const [year, month, day] = serviceDate.split('-').map(Number);
  const startIso = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0, 0)).toISOString();

  const now = new Date();
  const meta = buildMeta(now);
  const logSince = new Date(
    new Date(meta.lastBatchRunAt).getTime() - 2 * 60 * 60 * 1000,
  ).toISOString();

  const [docs, logMaps] = await Promise.all([
    fetchAppointmentsInRange(startIso, endIso, false),
    fetchReminderLogs(supabase, logSince),
  ]);

  const prefs = await collectPrefsForDocs(supabase, docs);
  const section: 'upcoming' | 'lastRun' =
    serviceDate === meta.upcomingServiceDate ? 'upcoming' : 'lastRun';

  const rows: ReminderRow[] = [];
  for (const doc of docs) {
    rows.push(
      await buildReminderRow(doc, 'client', section, logMaps, meta, supabase, prefs),
    );
    rows.push(
      await buildReminderRow(doc, 'professional', section, logMaps, meta, supabase, prefs),
    );
  }

  return rows;
}

function getAppointmentAddressFromData(data: Record<string, unknown>): string {
  const serviceAddress = data.serviceAddress as Record<string, unknown> | undefined;
  if (serviceAddress?.addressLine && typeof serviceAddress.addressLine === 'string') {
    return serviceAddress.addressLine;
  }
  const location = data.location as Record<string, unknown> | undefined;
  if (location?.address && typeof location.address === 'string') {
    return location.address;
  }
  return '';
}

function buildRetryAppointmentPayload(
  appointmentId: string,
  data: Record<string, unknown>,
) {
  return {
    clientName: String(data.clientName ?? 'Cliente'),
    professionalName: String(data.providerName ?? 'Profesional'),
    scheduledDate: String(data.scheduledDate ?? ''),
    address: getAppointmentAddressFromData(data),
    durationMinutes: Number(data.duration ?? 0) || 0,
    totalAmount: Number(data.totalAmount ?? data.price ?? 0) || 0,
    paymentStatus: String(data.paymentStatus ?? 'PAGO_PENDIENTE'),
    appointmentId,
  };
}

export async function handleRetry(
  supabase: SupabaseClient,
  appointmentId: string,
  recipientType: RecipientType,
): Promise<Response> {
  const trimmedId = appointmentId.trim();
  if (!trimmedId) {
    return jsonResponse({ error: 'appointmentId es requerido.' }, 400);
  }
  if (!['client', 'professional'].includes(recipientType)) {
    return jsonResponse({ error: 'recipientType inválido.' }, 400);
  }

  const data = await getFirestoreDocument('appointments', trimmedId);
  if (!data) {
    return jsonResponse({ error: 'Cita no encontrada.' }, 404);
  }

  const recipientKey = await resolveRecipientKey(supabase, data, recipientType);
  if (recipientKey) {
    const prefs = await loadRecipientPreferences(supabase, [{ recipientKey, recipientType }]);
    const enabled = getRemindersEnabled(prefs, recipientKey, recipientType);
    if (!enabled) {
      return jsonResponse({ error: 'Recordatorio desactivado para este destinatario.' }, 409);
    }
  }

  const sentAtField = recipientType === 'client'
    ? 'recordatorio24hSentAt'
    : 'recordatorioProfesionalSentAt';
  const existingSentAt = parseTimestamp(data[sentAtField]);
  if (existingSentAt) {
    return jsonResponse({ error: 'El recordatorio ya fue enviado.' }, 409);
  }

  let phone: string | null = null;
  if (recipientType === 'client') {
    phone = await resolveClientPhoneForAppointment(supabase, data);
  } else {
    const resolved = await resolveProfessionalPhoneForAppointment(data);
    phone = resolved.phone;
    if (resolved.missingProfessional) {
      return jsonResponse({ error: 'Cita sin profesional asignado.' }, 400);
    }
  }

  if (!phone) {
    return jsonResponse({ error: 'No se pudo resolver teléfono del destinatario.' }, 400);
  }

  const url = Deno.env.get('SEND_APPOINTMENT_REMINDER_URL')?.trim()
    ?? `${Deno.env.get('SUPABASE_URL')?.trim()}/functions/v1/send-appointment-reminder`;
  const apiKey = Deno.env.get('REMINDER_API_KEY')?.trim();
  if (!apiKey) {
    return jsonResponse({ error: 'REMINDER_API_KEY no configurada.' }, 503);
  }

  const appointmentData = buildRetryAppointmentPayload(trimmedId, data);
  const attemptFields = recipientType === 'client'
    ? {
        lastAttemptAt: 'recordatorio24hLastAttemptAt',
        lastError: 'recordatorio24hLastError',
        attemptCount: 'recordatorio24hAttemptCount',
        sentAt: 'recordatorio24hSentAt',
      }
    : {
        lastAttemptAt: 'recordatorioProfesionalLastAttemptAt',
        lastError: 'recordatorioProfesionalLastError',
        attemptCount: 'recordatorioProfesionalAttemptCount',
        sentAt: 'recordatorioProfesionalSentAt',
      };

  const currentCount = Number(data[attemptFields.attemptCount] ?? 0) || 0;
  const nowIso = new Date().toISOString();

  await patchFirestoreDocument('appointments', trimmedId, {
    [attemptFields.lastAttemptAt]: nowIso,
    [attemptFields.attemptCount]: currentCount + 1,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        recipientPhone: phone,
        recipientType,
        appointmentData,
      }),
    });
  } catch (error) {
    const msg = `network: ${formatError(error)}`;
    await patchFirestoreDocument('appointments', trimmedId, {
      [attemptFields.lastError]: msg,
    });
    return jsonResponse({ success: false, error: msg }, 502);
  }

  if (!response.ok) {
    let errorText = '';
    try {
      const json = (await response.json()) as { error?: string };
      errorText = json.error ?? JSON.stringify(json);
    } catch {
      errorText = await response.text().catch(() => '');
    }
    const msg = `http_${response.status}: ${errorText || 'sin detalle'}`;
    await patchFirestoreDocument('appointments', trimmedId, {
      [attemptFields.lastError]: msg,
    });
    return jsonResponse({ success: false, error: msg }, response.status);
  }

  const result = (await response.json()) as {
    success?: boolean;
    waMessageId?: string;
    error?: string;
  };

  if (!result.success) {
    const msg = result.error ?? 'Envío rechazado por Meta';
    await patchFirestoreDocument('appointments', trimmedId, {
      [attemptFields.lastError]: msg,
    });
    return jsonResponse({ success: false, error: msg }, 412);
  }

  await patchFirestoreDocument('appointments', trimmedId, {
    [attemptFields.sentAt]: nowIso,
    [attemptFields.lastError]: null,
  });

  if (recipientType === 'client' && !String(data.clientPhone ?? '').trim()) {
    await patchFirestoreDocument('appointments', trimmedId, { clientPhone: phone }).catch(() => {
      /* cache opcional */
    });
  }

  return jsonResponse({
    success: true,
    waMessageId: result.waMessageId ?? null,
  });
}

export async function setRecipientPreference(
  supabase: SupabaseClient,
  params: {
    recipientKey: string;
    recipientType: RecipientType;
    remindersEnabled: boolean;
    updatedBy: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('reminder_recipient_preferences').upsert(
    {
      recipient_key: params.recipientKey,
      recipient_type: params.recipientType,
      reminders_enabled: params.remindersEnabled,
      updated_by: params.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'recipient_key,recipient_type' },
  );
  if (error) throw new Error(formatError(error));
}

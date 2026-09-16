export const DIRECTORY_WORKSPACE_VIEWS = ['scheduled', 'all', 'canceled'] as const;
export type DirectoryWorkspaceView = (typeof DIRECTORY_WORKSPACE_VIEWS)[number];

export const DIRECTORY_WORKSPACE_SEGMENTS = ['recurring', 'reactivation'] as const;
export type DirectoryWorkspaceSegment = (typeof DIRECTORY_WORKSPACE_SEGMENTS)[number];

export const DIRECTORY_WORKSPACE_ACTIONS = ['summary', 'page', 'cancellations'] as const;
export type DirectoryWorkspaceAction = (typeof DIRECTORY_WORKSPACE_ACTIONS)[number];

export interface DirectoryWorkspaceKpis {
  total: number;
  scheduled: number;
  canceledOrRejected: number;
  recurring: number;
  reactivation: number;
}

export type DirectoryPaymentDisplay =
  | 'AL_DIA'
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'SIN_HISTORIAL';

export interface DirectoryWorkspaceRow {
  id: string;
  fullName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  appUserId: string | null;
  isAppUser: boolean;
  providerId: string | null;
  serviceId: string | null;
  classification: string | null;
  qualityTag: string | null;
  status: string | null;
  source: string | null;
  channels: string[];
  tags: string[];
  messagesCount: number;
  unreadWhatsappCount: number;
  lastWhatsappMessageAt: string | null;
  lastContactAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  appointmentCount: number;
  lastAppointmentAt: string | null;
  nextAppointmentAt: string | null;
  lastCompletedPaymentStatus: string | null;
  computedDebt: number;
  cancellationCount: number;
  latestCancellationAppointmentId: string | null;
  latestCancellationAt: string | null;
  latestCancellationStatus: string | null;
  latestCancellationReason: string | null;
  latestCancellationReasonOther: string | null;
  isScheduled: boolean;
  isCanceled: boolean;
  isRecurring: boolean;
  isReactivation: boolean;
  isBlacklisted: boolean;
  matchedCount: number;
}

export interface DirectoryCancellationIncident {
  appointmentId: string;
  status: 'CANCELED' | 'REJECTED';
  scheduledStart: string | null;
  updatedAt: string | null;
  reason: string | null;
  reasonOther: string | null;
}

export interface DirectoryWorkspacePageResult {
  items: DirectoryWorkspaceRow[];
  matchedCount: number;
  hasMore: boolean;
  nextOffset: number | null;
}

const CANCELLATION_REASON_LABELS: Record<string, string> = {
  cliente_viaja_aplaza: 'El cliente viaja o aplaza',
  no_necesita: 'Ya no necesita el servicio',
  precio: 'Precio',
  calidad_queja: 'Queja de calidad',
  fuerza_mayor: 'Fuerza mayor',
  error_interno: 'Error interno',
  no_confirmo: 'No confirmó',
  falta_por_confirmar: 'Falta por confirmar el motivo',
  otro: 'Otro',
  motivo_desconocido_legacy: 'Motivo no registrado',
};

export function isDirectoryWorkspaceView(
  value: string | null | undefined,
): value is DirectoryWorkspaceView {
  return Boolean(value && (DIRECTORY_WORKSPACE_VIEWS as readonly string[]).includes(value));
}

export function isDirectoryWorkspaceSegment(
  value: string | null | undefined,
): value is DirectoryWorkspaceSegment {
  return Boolean(value && (DIRECTORY_WORKSPACE_SEGMENTS as readonly string[]).includes(value));
}

export function isDirectoryWorkspaceAction(
  value: string | null | undefined,
): value is DirectoryWorkspaceAction {
  return Boolean(value && (DIRECTORY_WORKSPACE_ACTIONS as readonly string[]).includes(value));
}

export function resolveDirectoryWorkspaceAction(raw: unknown): DirectoryWorkspaceAction {
  const value = typeof raw === 'string' ? raw : null;
  return isDirectoryWorkspaceAction(value) ? value : 'summary';
}

export function resolveDirectoryWorkspaceView(raw: unknown): DirectoryWorkspaceView {
  if (raw === 'directorio') return 'all';
  if (raw === 'cancelados') return 'canceled';
  if (raw === 'agendados') return 'scheduled';
  const value = typeof raw === 'string' ? raw : null;
  return isDirectoryWorkspaceView(value) ? value : 'all';
}

export function resolveDirectoryWorkspaceSegment(
  raw: unknown,
): DirectoryWorkspaceSegment | null {
  const value = typeof raw === 'string' ? raw : null;
  return isDirectoryWorkspaceSegment(value) ? value : null;
}

export function requireDirectoryId(raw: unknown): string {
  const directoryId = typeof raw === 'string' ? raw.trim() : '';
  if (!directoryId) {
    throw new Error('directoryId es obligatorio.');
  }
  return directoryId;
}

export function clampDirectoryPageSize(raw: unknown, fallback = 50): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

export function clampDirectoryOffset(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export function derivePaymentDisplay(status: string | null | undefined): DirectoryPaymentDisplay {
  if (!status) return 'SIN_HISTORIAL';
  if (status === 'PAGO_ACEPTADO') return 'AL_DIA';
  if (status === 'PAGO_EN_PROCESO') return 'EN_PROCESO';
  return 'PENDIENTE';
}

export function cancellationReasonLabel(reason: string | null | undefined): string {
  if (!reason?.trim()) return 'Sin motivo especificado';
  return CANCELLATION_REASON_LABELS[reason] ?? reason;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asIso(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

export function emptyDirectoryWorkspaceKpis(): DirectoryWorkspaceKpis {
  return {
    total: 0,
    scheduled: 0,
    canceledOrRejected: 0,
    recurring: 0,
    reactivation: 0,
  };
}

export function mapDirectoryWorkspaceSnapshot(raw: unknown): DirectoryWorkspaceKpis {
  const rec = asRecord(raw);
  return {
    total: asNumber(rec.total),
    scheduled: asNumber(rec.scheduled),
    canceledOrRejected: asNumber(rec.canceledOrRejected),
    recurring: asNumber(rec.recurring),
    reactivation: asNumber(rec.reactivation),
  };
}

export function mapDirectoryWorkspaceRow(raw: unknown): DirectoryWorkspaceRow {
  const rec = asRecord(raw);
  return {
    id: String(rec.id ?? rec.directory_id ?? ''),
    fullName: asString(rec.full_name) ?? asString(rec.fullName) ?? '',
    displayName: asString(rec.display_name) ?? asString(rec.displayName),
    email: asString(rec.email),
    phone: asString(rec.phone),
    photoUrl: asString(rec.photo_url) ?? asString(rec.photoUrl),
    appUserId: asString(rec.app_user_id) ?? asString(rec.appUserId),
    isAppUser: Boolean(rec.is_app_user ?? rec.isAppUser),
    providerId: asString(rec.provider_id) ?? asString(rec.providerId),
    serviceId: asString(rec.service_id) ?? asString(rec.serviceId),
    classification: asString(rec.classification),
    qualityTag: asString(rec.quality_tag) ?? asString(rec.qualityTag),
    status: asString(rec.status),
    source: asString(rec.source),
    channels: asStringArray(rec.channels),
    tags: asStringArray(rec.tags),
    messagesCount: asNumber(rec.messages_count ?? rec.messagesCount),
    unreadWhatsappCount: asNumber(rec.unread_whatsapp_count ?? rec.unreadWhatsappCount),
    lastWhatsappMessageAt: asIso(rec.last_whatsapp_message_at ?? rec.lastWhatsappMessageAt),
    lastContactAt: asIso(rec.last_contact_at ?? rec.lastContactAt),
    createdAt: asIso(rec.created_at ?? rec.createdAt),
    updatedAt: asIso(rec.updated_at ?? rec.updatedAt),
    appointmentCount: asNumber(rec.appointment_count ?? rec.appointmentCount),
    lastAppointmentAt: asIso(rec.last_appointment_at ?? rec.lastAppointmentAt),
    nextAppointmentAt: asIso(rec.next_appointment_at ?? rec.nextAppointmentAt),
    lastCompletedPaymentStatus: asString(
      rec.last_completed_payment_status ?? rec.lastCompletedPaymentStatus,
    ),
    computedDebt: asNumber(rec.computed_debt ?? rec.computedDebt),
    cancellationCount: asNumber(rec.cancellation_count ?? rec.cancellationCount),
    latestCancellationAppointmentId: asString(
      rec.latest_cancellation_appointment_id ?? rec.latestCancellationAppointmentId,
    ),
    latestCancellationAt: asIso(rec.latest_cancellation_at ?? rec.latestCancellationAt),
    latestCancellationStatus: asString(
      rec.latest_cancellation_status ?? rec.latestCancellationStatus,
    ),
    latestCancellationReason: asString(
      rec.latest_cancellation_reason ?? rec.latestCancellationReason,
    ),
    latestCancellationReasonOther: asString(
      rec.latest_cancellation_reason_other ?? rec.latestCancellationReasonOther,
    ),
    isScheduled: Boolean(rec.is_scheduled ?? rec.isScheduled),
    isCanceled: Boolean(rec.is_canceled ?? rec.isCanceled),
    isRecurring: Boolean(rec.is_recurring ?? rec.isRecurring),
    isReactivation: Boolean(rec.is_reactivation ?? rec.isReactivation),
    isBlacklisted: Boolean(rec.is_blacklisted ?? rec.isBlacklisted),
    matchedCount: asNumber(rec.matched_count ?? rec.matchedCount),
  };
}

export function mapDirectoryWorkspacePage(
  raw: unknown,
  limit = 50,
  offset = 0,
): DirectoryWorkspacePageResult {
  const rows = Array.isArray(raw) ? raw.map(mapDirectoryWorkspaceRow).filter((row) => row.id) : [];
  const matchedCount = rows[0]?.matchedCount ?? 0;
  const nextOffset = offset + rows.length;
  return {
    items: rows,
    matchedCount,
    hasMore: rows.length >= limit && nextOffset < matchedCount,
    nextOffset: rows.length >= limit && nextOffset < matchedCount ? nextOffset : null,
  };
}

export function mapDirectoryWorkspaceCancellations(raw: unknown): DirectoryCancellationIncident[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const rec = asRecord(item);
    const appointmentId = asString(rec.appointment_id ?? rec.appointmentId);
    const status = asString(rec.status);
    if (!appointmentId || (status !== 'CANCELED' && status !== 'REJECTED')) return [];
    return [{
      appointmentId,
      status,
      scheduledStart: asIso(rec.scheduled_start ?? rec.scheduledStart),
      updatedAt: asIso(rec.updated_at ?? rec.updatedAt),
      reason: asString(rec.cancellation_reason ?? rec.reason),
      reasonOther: asString(rec.cancellation_reason_other ?? rec.reasonOther),
    }];
  });
}

/**
 * Segmentación de clientes (activo / inactivo / blacklist) reutilizable
 * entre get-whatsapp-metrics y el motor de reactivaciones.
 */

import { directoryPhoneKey, isReactivationPhoneValid } from './directoryPhone.ts';
import {
  hasBlacklistTag,
  isCompanyClient,
  isRecurringClient,
  isTestContact,
  type ClassifiableClient,
} from './clientClassification.ts';
import { runFirestoreQuery } from './firebaseAdminRest.ts';

/** Ventana (meses) para detectar clientes reales y su última cita. */
export const CLIENT_APPOINTMENT_LOOKBACK_MONTHS = 24;
/** Días para considerar a un cliente "activo" (agendó recientemente). */
export const ACTIVE_CLIENT_WINDOW_DAYS = 30;
/** Máximo de días de inactividad para inscribir en reactivación. */
export const REACTIVATION_MAX_INACTIVE_DAYS = 120;
/** Días de inactividad tras los cuales se expulsa por stale. */
export const REACTIVATION_STALE_DAYS = 150;

export interface DirectorySegmentRow {
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
  sequence_step: number | null;
  last_contact_at: string | null;
  last_response_at: string | null;
  first_contact_at: string | null;
  created_at: string | null;
  internal_notes: string | null;
}

export interface LastAppointmentIndex {
  byPhoneKey: Map<string, string>;
  byAppUser: Map<string, string>;
  appointmentCount: number;
}

/** Perfil agregado desde citas Firebase (nombre más reciente + uid + conteo). */
export interface ClientProfile {
  name: string | null;
  appUserId: string | null;
  phone: string | null;
  lastIso: string | null;
  count: number;
}

export interface ClientProfileIndex {
  byPhoneKey: Map<string, ClientProfile>;
  byAppUser: Map<string, ClientProfile>;
  appointmentCount: number;
}

export interface SegmentedClient {
  id: string;
  name: string;
  phone: string | null;
  phoneKey: string | null;
  appUserId: string | null;
  classification: string | null;
  tags: string[];
  isCompany: boolean;
  isRecurring: boolean;
  isClient: boolean;
  isActive: boolean;
  isInactive: boolean;
  isBlacklisted: boolean;
  optOut: boolean;
  lastAppointmentDate: string | null;
  daysInactive: number | null;
  activeSequence: string | null;
  sequenceStep: number;
  lastContactAt: string | null;
  lastResponseAt: string | null;
}

export function phoneLookupKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return directoryPhoneKey(value) ?? (value.replace(/\D/g, '').slice(-10) || null);
}

export function asTagArray(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

export function scheduledDateToIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as { _seconds?: number; seconds?: number; toDate?: () => Date };
    if (typeof record.toDate === 'function') {
      const d = record.toDate();
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const seconds = record._seconds ?? record.seconds;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000).toISOString();
    }
  }
  return null;
}

export function buildClientAppointmentsQuery(
  startIso: string,
  serviceId?: string,
): Record<string, unknown> {
  const filters: Record<string, unknown>[] = [
    {
      fieldFilter: {
        field: { fieldPath: 'scheduledDate' },
        op: 'GREATER_THAN_OR_EQUAL',
        value: { timestampValue: startIso },
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

  if (filters.length === 1) {
    return { where: filters[0] };
  }
  return {
    where: {
      compositeFilter: { op: 'AND', filters },
    },
  };
}

export async function loadLastAppointmentIndex(params: {
  asOf?: Date;
  lookbackMonths?: number;
  serviceId?: string;
}): Promise<LastAppointmentIndex> {
  const asOf = params.asOf ?? new Date();
  const lookback = params.lookbackMonths ?? CLIENT_APPOINTMENT_LOOKBACK_MONTHS;
  const clientFrom = new Date(asOf);
  clientFrom.setMonth(clientFrom.getMonth() - lookback);

  const byPhoneKey = new Map<string, string>();
  const byAppUser = new Map<string, string>();
  let appointmentCount = 0;

  const clientDocs = await runFirestoreQuery(
    'appointments',
    buildClientAppointmentsQuery(clientFrom.toISOString(), params.serviceId),
  );
  appointmentCount = clientDocs.length;

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
    trackMax(byPhoneKey, phoneKey, iso);
    trackMax(byAppUser, appUser, iso);
  }

  return { byPhoneKey, byAppUser, appointmentCount };
}

/**
 * Índice de perfiles de cliente desde citas Firebase.
 * Por phone_key y appUserId (clientId) guarda el nombre de la cita más reciente,
 * el uid de app y el conteo de citas en la ventana.
 */
export async function loadClientProfileIndex(params: {
  asOf?: Date;
  lookbackMonths?: number;
  serviceId?: string;
}): Promise<ClientProfileIndex> {
  const asOf = params.asOf ?? new Date();
  const lookback = params.lookbackMonths ?? CLIENT_APPOINTMENT_LOOKBACK_MONTHS;
  const clientFrom = new Date(asOf);
  clientFrom.setMonth(clientFrom.getMonth() - lookback);

  const byPhoneKey = new Map<string, ClientProfile>();
  const byAppUser = new Map<string, ClientProfile>();

  const clientDocs = await runFirestoreQuery(
    'appointments',
    buildClientAppointmentsQuery(clientFrom.toISOString(), params.serviceId),
  );

  const track = (
    map: Map<string, ClientProfile>,
    key: string | null,
    iso: string,
    name: string | null,
    appUserId: string | null,
    phone: string | null,
  ) => {
    if (!key) return;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { name, appUserId, phone, lastIso: iso, count: 1 });
      return;
    }
    const next: ClientProfile = {
      name: prev.name,
      appUserId: prev.appUserId ?? appUserId,
      phone: prev.phone ?? phone,
      lastIso: prev.lastIso,
      count: prev.count + 1,
    };
    if (!prev.lastIso || iso > prev.lastIso) {
      next.lastIso = iso;
      if (name) next.name = name;
      if (appUserId) next.appUserId = appUserId;
      if (phone) next.phone = phone;
    } else {
      if (!next.name && name) next.name = name;
      if (!next.phone && phone) next.phone = phone;
    }
    map.set(key, next);
  };

  for (const doc of clientDocs) {
    const iso = scheduledDateToIso(doc.data.scheduledDate);
    if (!iso) continue;
    const rawPhone =
      typeof doc.data.clientPhone === 'string' ? doc.data.clientPhone.trim() : '';
    const phone = rawPhone.length > 0 ? rawPhone : null;
    const phoneKey = phoneLookupKey(phone);
    const appUser =
      typeof doc.data.clientId === 'string' && doc.data.clientId.trim()
        ? doc.data.clientId.trim()
        : null;
    const rawName =
      typeof doc.data.clientName === 'string' ? doc.data.clientName.trim() : '';
    const name = rawName.length > 0 ? rawName : null;
    track(byPhoneKey, phoneKey, iso, name, appUser, phone);
    track(byAppUser, appUser, iso, name, appUser, phone);
  }

  return { byPhoneKey, byAppUser, appointmentCount: clientDocs.length };
}

export function resolveLastAppointment(
  entry: Pick<DirectorySegmentRow, 'id' | 'phone' | 'phone_key' | 'app_user_id'>,
  index: LastAppointmentIndex,
): string | null {
  const candidates: string[] = [];
  const pkFromPhone = phoneLookupKey(entry.phone);
  if (entry.phone_key) {
    const iso = index.byPhoneKey.get(entry.phone_key);
    if (iso) candidates.push(iso);
  }
  if (pkFromPhone) {
    const iso = index.byPhoneKey.get(pkFromPhone);
    if (iso) candidates.push(iso);
  }
  if (entry.app_user_id) {
    const iso = index.byAppUser.get(entry.app_user_id);
    if (iso) candidates.push(iso);
  }
  // Citas creadas desde CRM/UserConsole suelen guardar clientId = crm_directory.id
  // aunque app_user_id del directorio esté vacío (p. ej. MFL eje cafetero).
  if (entry.id && entry.id !== entry.app_user_id) {
    const iso = index.byAppUser.get(entry.id);
    if (iso) candidates.push(iso);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((max, cur) => (cur > max ? cur : max));
}

export function daysBetween(iso: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((asOf.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

export function segmentDirectoryClient(params: {
  entry: DirectorySegmentRow;
  index: LastAppointmentIndex;
  blocklistKeys: Set<string>;
  asOf?: Date;
  activeWindowDays?: number;
}): SegmentedClient {
  const asOf = params.asOf ?? new Date();
  const activeWindow = params.activeWindowDays ?? ACTIVE_CLIENT_WINDOW_DAYS;
  const activeThreshold = new Date(
    asOf.getTime() - activeWindow * 24 * 60 * 60 * 1000,
  ).toISOString();

  const tags = asTagArray(params.entry.tags);
  const classifiable: ClassifiableClient = {
    classification: params.entry.classification,
    tags,
  };
  const isCompany = isCompanyClient(classifiable);
  const isRecurring = isRecurringClient(classifiable);
  const taggedBlacklist = hasBlacklistTag(classifiable);

  const candidates = [
    params.entry.phone_key,
    phoneLookupKey(params.entry.phone),
    params.entry.phone?.trim() || null,
  ];
  const blockedInInbox = candidates.some((k) => !!k && params.blocklistKeys.has(k));
  const isBlacklisted = taggedBlacklist || blockedInInbox;

  const lastAppointmentDate = resolveLastAppointment(params.entry, params.index);
  const isClient = lastAppointmentDate !== null;
  const isActive =
    isClient && !isBlacklisted && lastAppointmentDate! >= activeThreshold;
  const isInactive = isClient && !isBlacklisted && !isActive;
  const daysInactive = daysBetween(lastAppointmentDate, asOf);

  return {
    id: params.entry.id,
    name: params.entry.display_name || params.entry.full_name || 'Cliente',
    phone: params.entry.phone,
    phoneKey: params.entry.phone_key ?? phoneLookupKey(params.entry.phone),
    appUserId: params.entry.app_user_id,
    classification: params.entry.classification,
    tags,
    isCompany,
    isRecurring,
    isClient,
    isActive,
    isInactive,
    isBlacklisted,
    optOut: params.entry.opt_out === true,
    lastAppointmentDate,
    daysInactive,
    activeSequence: params.entry.active_sequence,
    sequenceStep: Number(params.entry.sequence_step ?? 0) || 0,
    lastContactAt: params.entry.last_contact_at,
    lastResponseAt: params.entry.last_response_at,
  };
}

export function isEligibleForReactivation(
  client: SegmentedClient,
  options?: {
    excludeCompanies?: boolean;
    maxInactiveDays?: number;
  },
): boolean {
  const excludeCompanies = options?.excludeCompanies ?? true;
  const maxInactive = options?.maxInactiveDays ?? REACTIVATION_MAX_INACTIVE_DAYS;

  if (!client.isClient || !client.isInactive) return false;
  if (client.isBlacklisted || client.optOut) return false;
  if (!isReactivationPhoneValid(client.phone)) return false;
  if (excludeCompanies && client.isCompany) return false;
  if (isTestContact({ classification: client.classification, tags: client.tags })) {
    return false;
  }
  if (client.daysInactive == null) return false;
  if (client.daysInactive < ACTIVE_CLIENT_WINDOW_DAYS) return false;
  if (client.daysInactive > maxInactive) return false;
  return true;
}

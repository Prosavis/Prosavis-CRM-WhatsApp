// deno-lint-ignore-file no-explicit-any
/**
 * Empaqueta contexto CRM para el AI del inbox WhatsApp:
 * historial reciente, tags, directorio y citas Firestore.
 */

import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_TRANSCRIPT_CHAR_BUDGET,
  buildTranscriptWithBudget,
  getConversationHistoryWithMeta,
  type ConversationHistoryMeta,
} from './conversationHistory.ts';
import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
  normalizeDirectoryPhoneE164,
} from './directoryPhone.ts';
import { runFirestoreQuery } from './firebaseAdminRest.ts';
import { scheduledDateToIso } from './clientSegments.ts';
import { normalizePhone } from './whatsappIdentity.ts';
import {
  INBOX_AI_SYSTEM_INSTRUCTION,
  buildPropertyLocationSummary,
  formatInboxAiContextBlock,
  groundBookingClientInfo,
  type InboxAiAppointment,
  type InboxAiDirectory,
  type InboxAiPropertySummary,
} from './inboxAiContextFormat.ts';

export {
  INBOX_AI_SYSTEM_INSTRUCTION,
  buildPropertyLocationSummary,
  formatInboxAiContextBlock,
  groundBookingClientInfo,
};
export type { InboxAiAppointment, InboxAiDirectory, InboxAiPropertySummary };

type SupabaseClient = any;

const NOTES_SUMMARY_MAX = 400;
const UPCOMING_APPTS = 5;
const PAST_APPTS = 5;
const APPT_QUERY_LIMIT = 40;
const APPT_LOOKBACK_MONTHS = 18;

export interface InboxAiContext {
  phone: string;
  transcript: string;
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  directory: InboxAiDirectory | null;
  appointments: InboxAiAppointment[];
  /** Total de citas en lookback (antes del slice de listado). */
  appointmentCount: number;
  propertySummary: InboxAiPropertySummary;
  formattedBlock: string;
  /** Rol del último turn tras merge (el presupuesto recorta desde lo antiguo). */
  lastTurnRole: 'user' | 'bot' | null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clipNotes(value: string | null | undefined, max = NOTES_SUMMARY_MAX): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

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
  return asTrimmedString(data.address);
}

function resolveAddressReference(data: Record<string, unknown>): string | null {
  const serviceAddress = data.serviceAddress;
  if (serviceAddress && typeof serviceAddress === 'object') {
    return asTrimmedString((serviceAddress as Record<string, unknown>).reference);
  }
  return null;
}

function cityFromDirectoryRow(row: Record<string, unknown>): string | null {
  const meta = row.metadata;
  if (meta && typeof meta === 'object') {
    return asTrimmedString((meta as Record<string, unknown>).city);
  }
  return null;
}

async function loadConversationTags(
  supabase: SupabaseClient,
  stableKey: string,
): Promise<string[]> {
  const { data: conv, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('tag_ids')
    .eq('stable_key', stableKey)
    .maybeSingle();
  if (convError) throw convError;

  const tagIds: string[] = Array.isArray(conv?.tag_ids) ? conv.tag_ids : [];
  if (!tagIds.length) return [];

  const { data: tags, error: tagsError } = await supabase
    .from('whatsapp_chat_tags')
    .select('id, name, archived')
    .in('id', tagIds)
    .eq('archived', false);
  if (tagsError) throw tagsError;

  const byId = new Map<string, string>();
  for (const row of tags ?? []) {
    if (row?.id && typeof row.name === 'string' && row.name.trim()) {
      byId.set(String(row.id), row.name.trim());
    }
  }
  return tagIds.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

async function loadDirectoryByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<InboxAiDirectory | null> {
  const e164 = normalizeDirectoryPhoneE164(phone) ?? phone;
  const variants = directoryPhoneLookupVariants(e164);
  const lookupPhones = variants.length > 0 ? variants : [phone];

  const { data: rows, error } = await supabase
    .from('crm_directory')
    .select(
      'id, full_name, display_name, phone, email, address, preferred_service_address_line, notes, internal_notes, tags, app_user_id, metadata',
    )
    .in('phone', lookupPhones)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  const targetKey = directoryPhoneKey(phone);
  const row =
    (rows ?? []).find((r: Record<string, unknown>) => {
      const key = directoryPhoneKey(asTrimmedString(r.phone));
      return targetKey && key && key === targetKey;
    }) ?? (rows ?? [])[0] ?? null;

  if (!row) return null;

  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  const notes = clipNotes(
    [asTrimmedString(row.notes), asTrimmedString(row.internal_notes)]
      .filter(Boolean)
      .join(' | ') || null,
  );
  const appUserId = asTrimmedString(row.app_user_id);

  return {
    id: String(row.id),
    fullName: asTrimmedString(row.display_name) ?? asTrimmedString(row.full_name),
    email: asTrimmedString(row.email),
    address: asTrimmedString(row.address),
    preferredServiceAddress: asTrimmedString(row.preferred_service_address_line),
    city: cityFromDirectoryRow(row as Record<string, unknown>),
    tags,
    appUserId,
    notesSummary: notes,
    isReturningClient: Boolean(appUserId),
  };
}

function resolveProviderName(data: Record<string, unknown>): string | null {
  const rawNames = Array.isArray(data.assignedTeamMemberNames)
    ? data.assignedTeamMemberNames
    : [];
  const assignedNames = rawNames
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name.length > 0);
  if (assignedNames.length === 1) return assignedNames[0];
  if (assignedNames.length > 1) {
    return `${assignedNames.slice(0, -1).join(', ')} y ${assignedNames[assignedNames.length - 1]}`;
  }
  return asTrimmedString(data.providerName);
}

function mapAppointmentDoc(doc: { id: string; data: Record<string, unknown> }): InboxAiAppointment | null {
  const iso = scheduledDateToIso(doc.data.scheduledDate);
  if (!iso) return null;
  return {
    id: doc.id,
    scheduledDate: iso,
    status: asTrimmedString(doc.data.status),
    serviceName:
      asTrimmedString(doc.data.serviceTitle) ??
      asTrimmedString(doc.data.serviceName) ??
      asTrimmedString(doc.data.serviceId),
    address: resolveAddressLine(doc.data),
    addressReference: resolveAddressReference(doc.data),
    duration: asFiniteNumber(doc.data.duration),
    clientName: asTrimmedString(doc.data.clientName),
    providerName: resolveProviderName(doc.data),
  };
}

async function queryAppointmentsByField(
  fieldPath: string,
  stringValue: string,
): Promise<InboxAiAppointment[]> {
  const lookback = new Date();
  lookback.setMonth(lookback.getMonth() - APPT_LOOKBACK_MONTHS);
  const lookbackIso = lookback.toISOString();

  const docs = await runFirestoreQuery('appointments', {
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath },
              op: 'EQUAL',
              value: { stringValue },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'scheduledDate' },
              op: 'GREATER_THAN_OR_EQUAL',
              value: { timestampValue: lookbackIso },
            },
          },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: 'scheduledDate' }, direction: 'DESCENDING' }],
    limit: APPT_QUERY_LIMIT,
  });

  return docs.map(mapAppointmentDoc).filter((a): a is InboxAiAppointment => a != null);
}

export interface LoadAppointmentsResult {
  /** Listado corto para el prompt (próximas + pasadas recientes). */
  appointments: InboxAiAppointment[];
  /** Set completo de lookback (para conteo y análisis de propiedades). */
  allAppointments: InboxAiAppointment[];
  /** Todas las citas únicas halladas en lookback (antes del slice de UI/contexto). */
  totalCount: number;
}

/**
 * Carga citas por teléfono/clientId. Degrada a [] si Firebase falla.
 */
export async function loadAppointmentsForContact(params: {
  phone: string;
  directoryId?: string | null;
  appUserId?: string | null;
}): Promise<LoadAppointmentsResult> {
  // Variantes prioritarias (evitar N queries lentas a Firestore).
  const e164 = normalizeDirectoryPhoneE164(params.phone);
  const digits = params.phone.replace(/\D/g, '');
  const candidates = new Set<string>();
  if (e164) candidates.add(e164);
  if (digits) {
    candidates.add(digits);
    if (!digits.startsWith('57') && digits.length === 10) {
      candidates.add(`57${digits}`);
      candidates.add(`+57${digits}`);
    }
  }
  for (const v of directoryPhoneLookupVariants(params.phone).slice(0, 4)) {
    if (candidates.size >= 4) break;
    candidates.add(v);
  }

  const clientIds = new Set<string>();
  if (params.appUserId?.trim()) clientIds.add(params.appUserId.trim());
  if (params.directoryId?.trim()) clientIds.add(params.directoryId.trim());

  const byId = new Map<string, InboxAiAppointment>();

  const runSafe = async (field: string, value: string) => {
    try {
      const rows = await queryAppointmentsByField(field, value);
      for (const row of rows) byId.set(row.id, row);
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'inbox-ai-context',
          event: 'appointments-query-failed',
          field,
          value,
          error: String((err as Error)?.message ?? err),
        }),
      );
    }
  };

  for (const id of clientIds) {
    await runSafe('clientId', id);
  }
  for (const variant of candidates) {
    await runSafe('clientPhone', variant);
  }

  const all = [...byId.values()];
  all.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  const totalCount = all.length;

  const now = Date.now();
  const upcoming = all
    .filter((a) => new Date(a.scheduledDate).getTime() >= now)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    .slice(0, UPCOMING_APPTS);
  const past = all
    .filter((a) => new Date(a.scheduledDate).getTime() < now)
    .slice(0, PAST_APPTS);

  return {
    appointments: [...upcoming, ...past],
    allAppointments: all,
    totalCount,
  };
}

export async function buildInboxAiContext(
  supabase: SupabaseClient,
  stableKey: string,
  options?: {
    includeVoiceTranscriptions?: boolean;
    historyLimit?: number;
    transcriptCharBudget?: number;
  },
): Promise<InboxAiContext> {
  const phone = normalizePhone(stableKey);
  const historyLimit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const charBudget = options?.transcriptCharBudget ?? DEFAULT_TRANSCRIPT_CHAR_BUDGET;

  const history = await getConversationHistoryWithMeta(supabase, stableKey, historyLimit, {
    includeVoiceTranscriptions: options?.includeVoiceTranscriptions === true,
  });
  if (!history.turns.length) {
    throw new Error('No se encontró historial de conversación.');
  }

  const { transcript, meta: historyMeta, merged } = buildTranscriptWithBudget(
    history.turns,
    history.meta,
    charBudget,
  );
  if (!transcript.trim() || !merged.length) {
    throw new Error('No hay mensajes del cliente en el historial.');
  }
  const lastTurnRole = merged[merged.length - 1]?.role ?? null;

  let conversationTags: string[] = [];
  try {
    conversationTags = await loadConversationTags(supabase, stableKey);
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'inbox-ai-context',
        event: 'conversation-tags-failed',
        error: String((err as Error)?.message ?? err),
      }),
    );
  }

  let directory: InboxAiDirectory | null = null;
  try {
    directory = await loadDirectoryByPhone(supabase, phone);
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'inbox-ai-context',
        event: 'directory-lookup-failed',
        error: String((err as Error)?.message ?? err),
      }),
    );
  }

  let appointments: InboxAiAppointment[] = [];
  let allAppointments: InboxAiAppointment[] = [];
  let appointmentCount = 0;
  try {
    const loaded = await loadAppointmentsForContact({
      phone,
      directoryId: directory?.id,
      appUserId: directory?.appUserId,
    });
    appointments = loaded.appointments;
    allAppointments = loaded.allAppointments;
    appointmentCount = loaded.totalCount;
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'inbox-ai-context',
        event: 'appointments-load-failed',
        error: String((err as Error)?.message ?? err),
      }),
    );
    appointments = [];
    allAppointments = [];
    appointmentCount = 0;
  }

  if (directory && appointmentCount > 0) {
    directory = { ...directory, isReturningClient: true };
  }

  const propertySummary = buildPropertyLocationSummary({
    appointments: allAppointments,
    preferredDirectoryAddress:
      directory?.preferredServiceAddress ?? directory?.address ?? null,
  });

  const nowIso = new Date().toISOString();
  const formattedBlock = formatInboxAiContextBlock({
    phone,
    transcript,
    historyMeta,
    conversationTags,
    directory,
    appointments,
    appointmentCount,
    allAppointmentsForProperties: allAppointments,
    propertySummary,
    nowIso,
  });

  return {
    phone,
    transcript,
    historyMeta,
    conversationTags,
    directory,
    appointments,
    appointmentCount,
    propertySummary,
    formattedBlock,
    lastTurnRole,
  };
}

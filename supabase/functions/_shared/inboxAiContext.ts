// deno-lint-ignore-file no-explicit-any
/**
 * Empaqueta contexto CRM para el AI del inbox WhatsApp:
 * historial reciente, tags, directorio y citas Firestore.
 */

import { analyzeUncachedInboundImagesForConversation } from './analyzeInboundImage.ts';
import {
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_TRANSCRIPT_CHAR_BUDGET,
  buildTranscriptWithBudget,
  getConversationHistoryWithMeta,
  type ConversationHistoryMeta,
} from './conversationHistory.ts';
import {
  directoryPhoneLookupVariants,
  normalizeDirectoryPhoneE164,
} from './directoryPhone.ts';
import { runFirestoreQuery } from './firebaseAdminRest.ts';
import {
  appointmentLookbackIso,
  buildInboxAiClientIdAppointmentQuery,
  buildInboxAiClientPhoneAppointmentQuery,
  filterAppointmentsByLookback,
} from './inboxAiAppointmentQuery.ts';
import { scheduledDateToIso } from './clientSegments.ts';
import { normalizePhone } from './whatsappIdentity.ts';
import {
  INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET,
  INBOX_AI_SYSTEM_INSTRUCTION,
  SECTION_CHAR_BUDGETS,
  buildPropertyLocationSummary,
  formatInboxAiContextBlock,
  groundBookingClientInfo,
  groundBookingPayment,
  mapInboxAiAppointmentPayment,
  type InboxAiAppointment,
  type InboxAiDirectory,
  type InboxAiPropertySummary,
} from './inboxAiContextFormat.ts';
import {
  loadConversationContext,
  loadDirectoryByPhone,
  loadOfficialAnswers,
  type InboxAiConversationContext,
  type InboxAiOfficialAnswers,
} from './inboxAiKnowledge.ts';
import {
  loadOrRefreshInboxAiMemory,
  type InboxAiMemory,
} from './inboxAiMemory.ts';
import {
  resolveInboxAiCanonicalName,
  resolveInboxAiGreetingFirstName,
} from './inboxAiNameGrounding.ts';
import {
  buildMetaSessionWindow,
  type MetaSessionWindow,
} from './metaSessionWindow.ts';

export {
  INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET,
  INBOX_AI_SYSTEM_INSTRUCTION,
  SECTION_CHAR_BUDGETS,
  buildPropertyLocationSummary,
  formatInboxAiContextBlock,
  groundBookingClientInfo,
  groundBookingPayment,
};
export type { InboxAiAppointment, InboxAiDirectory, InboxAiPropertySummary };
export type { InboxAiConversationContext, InboxAiOfficialAnswers };
export type { InboxAiMemory };
export type { MetaSessionWindow };

type SupabaseClient = any;

const UPCOMING_APPTS = 5;
const PAST_APPTS = 5;

export interface InboxAiContext {
  phone: string;
  transcript: string;
  historyMeta: ConversationHistoryMeta;
  memory: InboxAiMemory | null;
  conversationContext: InboxAiConversationContext;
  conversationTags: string[];
  directory: InboxAiDirectory | null;
  officialAnswers: InboxAiOfficialAnswers;
  appointments: InboxAiAppointment[];
  /** Total de citas en lookback (antes del slice de listado). */
  appointmentCount: number;
  propertySummary: InboxAiPropertySummary;
  sessionWindow: MetaSessionWindow;
  formattedBlock: string;
  /** Rol del último turn tras merge (el presupuesto recorta desde lo antiguo). */
  lastTurnRole: 'user' | 'bot' | null;
  canonicalName: string | null;
  greetingFirstName: string | null;
  appointmentsLoadFailed: boolean;
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
    ...mapInboxAiAppointmentPayment(doc.data),
  };
}

async function queryAppointmentsByField(
  fieldPath: string,
  stringValue: string,
): Promise<InboxAiAppointment[]> {
  const lookbackIso = appointmentLookbackIso();
  const structuredQuery = fieldPath === 'clientPhone'
    ? buildInboxAiClientPhoneAppointmentQuery(fieldPath, stringValue)
    : buildInboxAiClientIdAppointmentQuery(fieldPath, stringValue, lookbackIso);

  const docs = await runFirestoreQuery('appointments', structuredQuery);
  const mapped = docs.map(mapAppointmentDoc).filter(
    (appointment): appointment is InboxAiAppointment => appointment != null,
  );
  return fieldPath === 'clientPhone'
    ? filterAppointmentsByLookback(mapped, lookbackIso)
    : mapped;
}

export interface LoadAppointmentsResult {
  /** Listado corto para el prompt (próximas + pasadas recientes). */
  appointments: InboxAiAppointment[];
  /** Set completo de lookback (para conteo y análisis de propiedades). */
  allAppointments: InboxAiAppointment[];
  /** Todas las citas únicas halladas en lookback (antes del slice de UI/contexto). */
  totalCount: number;
  /** True si todas las queries Firestore fallaron. */
  appointmentsLoadFailed: boolean;
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
  let attempts = 0;
  let successes = 0;

  const runSafe = async (field: string, value: string) => {
    attempts += 1;
    try {
      const rows = await queryAppointmentsByField(field, value);
      for (const row of rows) byId.set(row.id, row);
      successes += 1;
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
    appointmentsLoadFailed: attempts > 0 && successes === 0,
  };
}

export async function buildInboxAiContext(
  supabase: SupabaseClient,
  stableKey: string,
  options?: {
    includeVoiceTranscriptions?: boolean;
    includeImageAnalysis?: boolean;
    historyLimit?: number;
    transcriptCharBudget?: number;
  },
): Promise<InboxAiContext> {
  const phone = normalizePhone(stableKey);
  const historyLimit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const charBudget = options?.transcriptCharBudget ?? DEFAULT_TRANSCRIPT_CHAR_BUDGET;

  if (options?.includeImageAnalysis === true) {
    try {
      await analyzeUncachedInboundImagesForConversation(supabase, stableKey, {
        historyLimit,
      });
    } catch (error) {
      console.error('[inbox-ai] image analysis batch failed', error);
    }
  }

  const history = await getConversationHistoryWithMeta(supabase, stableKey, historyLimit, {
    includeVoiceTranscriptions: options?.includeVoiceTranscriptions === true,
    includeImageAnalysis: options?.includeImageAnalysis === true,
  });
  if (!history.turns.length) {
    throw new Error('No se encontró historial de conversación.');
  }

  const { transcript, meta: historyMeta, merged, completeMerged } = buildTranscriptWithBudget(
    history.turns,
    history.meta,
    charBudget,
  );
  if (!transcript.trim() || !merged.length) {
    throw new Error('No hay mensajes del cliente en el historial.');
  }
  const lastTurnRole = merged[merged.length - 1]?.role ?? null;
  const nowIso = new Date().toISOString();
  const sessionWindow = buildMetaSessionWindow(completeMerged, nowIso);

  let conversationContext: InboxAiConversationContext = {
    tags: [],
    adminNotes: null,
    assignedTo: null,
    lastIntent: null,
    automatedInboundDisabled: false,
  };
  try {
    conversationContext = await loadConversationContext(supabase, stableKey);
  } catch (err) {
    console.warn(
      JSON.stringify({
        scope: 'inbox-ai-context',
        event: 'conversation-context-failed',
        error: String((err as Error)?.message ?? err),
      }),
    );
  }
  const conversationTags = conversationContext.tags;

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

  const canonicalName = resolveInboxAiCanonicalName({
    directoryName: directory?.fullName,
    contactName: conversationContext.contactName,
    whatsappProfileName: conversationContext.whatsappProfileName,
  });
  const greetingFirstName = resolveInboxAiGreetingFirstName(canonicalName);
  const memory = await loadOrRefreshInboxAiMemory({
    supabase,
    stableKey,
    transcript,
    historyMeta,
    canonicalName,
  });

  const officialAnswers = await loadOfficialAnswers(supabase);

  let appointments: InboxAiAppointment[] = [];
  let allAppointments: InboxAiAppointment[] = [];
  let appointmentCount = 0;
  let appointmentsLoadFailed = false;
  try {
    const loaded = await loadAppointmentsForContact({
      phone,
      directoryId: directory?.id,
      appUserId: directory?.appUserId,
    });
    appointments = loaded.appointments;
    allAppointments = loaded.allAppointments;
    appointmentCount = loaded.totalCount;
    appointmentsLoadFailed = loaded.appointmentsLoadFailed === true;
  } catch (err) {
    appointmentsLoadFailed = true;
    console.warn(
      JSON.stringify({
        scope: 'inbox-ai-context',
        event: 'appointments-load-failed',
        error: String((err as Error)?.message ?? err),
      }),
    );
  }

  if (directory && appointmentCount > 0) {
    directory = { ...directory, isReturningClient: true };
  }

  const propertySummary = buildPropertyLocationSummary({
    appointments: allAppointments,
    preferredDirectoryAddress:
      directory?.preferredServiceAddress ?? directory?.address ?? null,
  });

  const formattedBlock = formatInboxAiContextBlock({
    phone,
    transcript,
    historyMeta,
    memory,
    conversationTags,
    conversationContext,
    directory,
    officialAnswers,
    appointments,
    appointmentCount,
    allAppointmentsForProperties: allAppointments,
    propertySummary,
    sessionWindow,
    nowIso,
    canonicalName,
    greetingFirstName,
    appointmentsLoadFailed,
  });

  return {
    phone,
    transcript,
    historyMeta,
    memory,
    conversationContext,
    conversationTags,
    directory,
    officialAnswers,
    appointments,
    appointmentCount,
    propertySummary,
    sessionWindow,
    formattedBlock,
    lastTurnRole,
    canonicalName,
    greetingFirstName,
    appointmentsLoadFailed,
  };
}

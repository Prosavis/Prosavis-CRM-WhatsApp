// directory-monitor: API unificada del monitor de calidad del directorio.
// Sirve a CRM WhatsApp (admin Supabase) y a User Console (admin Firebase) con las
// mismas acciones de lectura, descarte, fusión, aplicación (individual y masiva)
// de sugerencias y análisis con IA. La escritura se hace con service_role y de
// forma dirigida por id para no crear duplicados.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { requireDirectoryAdmin } from '../_shared/directoryMonitorAuth.ts';
import { runDirectoryAnalysis } from '../_shared/directoryAnalyze.ts';
import { directoryPhoneKey, normalizeDirectoryPhoneE164 } from '../_shared/directoryPhone.ts';
import {
  ACTIVE_CLIENT_WINDOW_DAYS,
  CLIENT_APPOINTMENT_LOOKBACK_MONTHS,
  loadClientProfileIndex,
  phoneLookupKey,
  type ClientProfile,
  type ClientProfileIndex,
} from '../_shared/clientSegments.ts';
import {
  getFirestoreDocument,
  getFirestoreUserPhone,
} from '../_shared/firebaseAdminRest.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const DUPLICATE_ISSUE_TYPES = ['duplicate_phone', 'duplicate_email', 'duplicate_name', 'duplicate_orphan'];

// ── Mapping (snake_case DB → camelCase cliente) ─────────────────────────────

function mapRowToEntry(row: Row) {
  return {
    id: row.id,
    fullName: row.full_name,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    appUserId: row.app_user_id ?? undefined,
    isAppUser: row.is_app_user,
    providerId: row.provider_id ?? undefined,
    serviceId: row.service_id ?? undefined,
    classification: row.classification,
    qualityTag: row.quality_tag,
    status: row.status,
    source: row.source ?? undefined,
    channels: row.channels ?? [],
    paymentStatus: row.payment_status ?? undefined,
    pendingAmount: row.pending_amount,
    pendingAppointmentsCount: row.pending_appointments_count,
    lastChargedAmount: row.last_charged_amount ?? undefined,
    otpRequired: row.otp_required,
    preferredServiceAddressLine: row.preferred_service_address_line ?? undefined,
    preferredServiceAddressRef: row.preferred_service_address_ref ?? undefined,
    firstContactAt: row.first_contact_at ?? undefined,
    lastContactAt: row.last_contact_at ?? undefined,
    messagesCount: row.messages_count,
    activeSequence: row.active_sequence,
    sequenceStep: row.sequence_step,
    optOut: row.opt_out,
    lastResponseText: row.last_response_text ?? undefined,
    lastResponseAt: row.last_response_at ?? undefined,
    lastWhatsAppMessageAt: row.last_whatsapp_message_at ?? undefined,
    lastWhatsAppMessageText: row.last_whatsapp_message_text ?? undefined,
    lastWhatsAppIntent: row.last_whatsapp_intent ?? undefined,
    unreadWhatsAppCount: row.unread_whatsapp_count,
    whatsAppAssignedTo: row.whatsapp_assigned_to ?? undefined,
    whatsAppConversationId: row.whatsapp_conversation_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

function mapIssueRow(row: Row, entry?: Row | null) {
  return {
    id: row.id,
    entryId: row.entry_id ?? undefined,
    relatedEntryIds: row.related_entry_ids ?? [],
    issueType: row.issue_type,
    severity: row.severity,
    status: row.status,
    details: row.details ?? {},
    detectedAt: row.detected_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolution: row.resolution ?? undefined,
    entry: entry ?? null,
  };
}

function mapSuggestionRow(row: Row, entry?: Row | null) {
  return {
    id: row.id,
    entryId: row.entry_id ?? undefined,
    issueId: row.issue_id ?? undefined,
    suggestionType: row.suggestion_type,
    field: row.field ?? undefined,
    currentValue: row.current_value ?? {},
    suggestedValue: row.suggested_value ?? {},
    confidence: row.confidence ?? undefined,
    reason: row.reason ?? undefined,
    relatedEntryIds: row.related_entry_ids ?? [],
    status: row.status,
    model: row.model ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at ?? undefined,
    appliedBy: row.applied_by ?? undefined,
    entry: entry ?? null,
  };
}

async function fetchEntriesByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, Row>> {
  const map = new Map<string, Row>();
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim() !== ''))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase.from('crm_directory').select('*').in('id', unique);
  if (error) throw new Error(formatError(error));
  for (const row of (data ?? []) as Row[]) map.set(row.id, mapRowToEntry(row));
  return map;
}

function matchesSearch(issue: Row, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const entry = issue.entry;
  const haystacks = [
    entry?.fullName,
    entry?.displayName,
    entry?.phone,
    entry?.email,
    String(issue.details?.full_name ?? ''),
    String(issue.details?.email ?? ''),
    String(issue.details?.phone_key ?? ''),
  ];
  return haystacks.some((value) => value?.toLowerCase().includes(needle));
}

// ── Helpers de escritura (service_role) ─────────────────────────────────────

const EMOJI_RE = /\p{Extended_Pictographic}/u;
const PLACEHOLDER_NAMES = new Set([
  'sin nombre',
  'sin nombre.',
  'unknown',
  'desconocido',
  'n/a',
  'na',
]);

function isUsefulName(value: string | null | undefined, minLen = 2): boolean {
  return (value ?? '').trim().length >= minLen;
}

/** Alineado con directory_name_has_emoji / is_missing / is_invalid (Postgres). */
function nameHasEmoji(value: string | null | undefined): boolean {
  return EMOJI_RE.test(value ?? '');
}

function nameIsMissing(
  name: string | null | undefined,
  phone: string | null | undefined,
  phoneKey: string | null | undefined,
): boolean {
  if (name == null || name.trim() === '') return true;
  const trimmed = name.trim();
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return true;
  const digits = trimmed.replace(/\D/g, '');
  if (phoneKey && digits === phoneKey) return true;
  if (phone && trimmed === phone.trim()) return true;
  return false;
}

function nameIsInvalid(name: string | null | undefined): boolean {
  if (name == null) return false;
  const trimmed = name.trim();
  if (trimmed === '') return false;
  if (trimmed.length <= 1) return true;
  return !/\p{L}/u.test(trimmed);
}

/** Nombre malo: vacío/placeholder/teléfono, emoji-only o sin letras. */
function needsNameFill(
  name: string | null | undefined,
  phone: string | null | undefined,
  phoneKey: string | null | undefined,
): boolean {
  if (nameIsMissing(name, phone, phoneKey)) return true;
  if (nameHasEmoji(name) && !/\p{L}/u.test((name ?? '').trim())) return true;
  if (nameIsInvalid(name)) return true;
  // Nombre con letras + emoji sigue siendo "malo" para el issue emoji_name;
  // el backfill solo lo reemplaza si Firebase trae un nombre usable sin emoji.
  if (nameHasEmoji(name)) return true;
  return false;
}

function isUsableFirebaseName(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed.length < 2) return false;
  if (!/\p{L}/u.test(trimmed)) return false;
  if (nameHasEmoji(trimmed)) return false;
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return false;
  return true;
}

/** Quita pictogramas, banderas, tonos de piel, ZWJ y selectores; colapsa espacios. */
function stripEmojiAndJunk(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    // Fitzpatrick skin tones + regional indicators (flags) — Postgres los marca como emoji.
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    // Alinear con directory_name_has_emoji (rangos misc. symbols / dingbats).
    .replace(/[\u2122\u2139\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF]/gu, '')
    .replace(/[\uFE0E\uFE0F\u200D]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsableDirectoryName(
  value: string | null | undefined,
  phone?: string | null,
  phoneKey?: string | null,
): boolean {
  const trimmed = (value ?? '').trim();
  if (!isUsableFirebaseName(trimmed)) return false;
  if (nameIsMissing(trimmed, phone, phoneKey)) return false;
  if (nameIsInvalid(trimmed)) return false;
  return true;
}

function pickCleanName(params: {
  fullName: string | null;
  displayName: string | null;
  contactName: string | null;
  profileName: string | null;
  phone: string | null;
  phoneKey: string | null;
}): string | null {
  const { fullName, displayName, contactName, profileName, phone, phoneKey } = params;
  // Si WA ya tiene un nombre limpio (sin emoji) y el CRM tiene emoji, preferir WA.
  if (
    isUsableDirectoryName(contactName, phone, phoneKey) &&
    !nameHasEmoji(contactName) &&
    nameHasEmoji(fullName ?? displayName)
  ) {
    return (contactName as string).trim();
  }
  const candidates = [
    stripEmojiAndJunk(fullName),
    stripEmojiAndJunk(displayName),
    stripEmojiAndJunk(contactName),
    stripEmojiAndJunk(profileName),
  ];
  for (const c of candidates) {
    if (isUsableDirectoryName(c, phone, phoneKey)) return c;
  }
  return null;
}

function firestoreUserDisplayName(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const candidates = [data.name, data.displayName, data.fullName, data.full_name];
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : '';
    if (isUsableFirebaseName(s)) return s;
  }
  return null;
}

function shouldSyncContactName(
  dirName: string | null | undefined,
  currentContactName: string | null | undefined,
): boolean {
  const canonical = (dirName ?? '').trim();
  if (!isUsefulName(canonical)) return false;
  const current = (currentContactName ?? '').trim();
  if (!current) return true;
  if (current.toLowerCase() === canonical.toLowerCase()) return false;
  if (EMOJI_RE.test(current) && !EMOJI_RE.test(canonical)) return true;
  return current !== canonical;
}

/** Sincroniza contact_name de la conversación WhatsApp vinculada a la entrada. */
async function syncWaContactName(
  supabase: SupabaseClient,
  entry: Row,
  desiredName: string,
): Promise<void> {
  if (!isUsefulName(desiredName)) return;

  let conversation: Row | null = null;
  const phoneKey = directoryPhoneKey(entry.phone ?? null);
  if (phoneKey) {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key, contact_name')
      .eq('phone_key', phoneKey)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    conversation = data ?? null;
  }
  if (!conversation && entry.whatsapp_conversation_id) {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key, contact_name')
      .eq('stable_key', entry.whatsapp_conversation_id)
      .maybeSingle();
    conversation = data ?? null;
  }

  if (!conversation) return;
  if (!shouldSyncContactName(desiredName, conversation.contact_name)) return;

  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ contact_name: desiredName })
    .eq('stable_key', conversation.stable_key);
  if (error) throw new Error(formatError(error));
}

async function resolveNameMismatchIssues(
  supabase: SupabaseClient,
  entryId: string,
): Promise<void> {
  const { data: openIssues } = await supabase
    .from('crm_directory_issues')
    .select('id')
    .eq('entry_id', entryId)
    .eq('issue_type', 'name_wa_mismatch')
    .eq('status', 'open');
  for (const row of (openIssues ?? []) as Row[]) {
    await supabase.rpc('resolve_directory_issue', {
      p_issue_id: row.id,
      p_resolution: 'auto_sync_crm_name',
    });
  }
}

/** Aplica una sugerencia individual con escritura dirigida por id. */
async function applySuggestionRow(supabase: SupabaseClient, suggestion: Row): Promise<void> {
  const entryId: string | null = suggestion.entry_id ?? null;
  if (!entryId && suggestion.suggestion_type !== 'merge') {
    throw new Error('La sugerencia no tiene entrada asociada.');
  }
  const suggested = (suggestion.suggested_value ?? {}) as Record<string, unknown>;
  const relatedEntryIds: string[] = Array.isArray(suggestion.related_entry_ids)
    ? suggestion.related_entry_ids
    : [];

  switch (suggestion.suggestion_type) {
    case 'name_cleanup': {
      const value = String(suggested.value ?? '').trim();
      const contactName = String(suggested.contact_name ?? value).trim();
      if (!value && !contactName) throw new Error('Sugerencia de nombre vacía.');

      const { data: entry, error: getErr } = await supabase
        .from('crm_directory')
        .select('id, phone, whatsapp_conversation_id')
        .eq('id', entryId)
        .maybeSingle();
      if (getErr) throw new Error(formatError(getErr));
      if (!entry) throw new Error('Entrada no encontrada.');

      if (value) {
        const { error } = await supabase
          .from('crm_directory')
          .update({ full_name: value, updated_at: new Date().toISOString() })
          .eq('id', entryId);
        if (error) throw new Error(formatError(error));
      }

      await syncWaContactName(supabase, entry, contactName || value);
      await resolveNameMismatchIssues(supabase, entryId as string);
      break;
    }
    case 'phone_fix': {
      const raw = String(suggested.value ?? '').trim();
      if (!raw) throw new Error('Sugerencia de teléfono vacía.');
      const normalized = normalizeDirectoryPhoneE164(raw) ?? raw;
      const phoneKey = directoryPhoneKey(normalized);
      const { error } = await supabase
        .from('crm_directory')
        .update({
          phone: normalized,
          phone_key: phoneKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entryId);
      if (error) throw new Error(formatError(error));
      break;
    }
    case 'tag_suggestion': {
      const newTags = Array.isArray(suggested.value) ? (suggested.value as unknown[]).map(String) : [];
      const { data: entry, error: getErr } = await supabase
        .from('crm_directory')
        .select('tags')
        .eq('id', entryId)
        .maybeSingle();
      if (getErr) throw new Error(formatError(getErr));
      const merged = [...new Set([...(entry?.tags ?? []), ...newTags])];
      const { error } = await supabase
        .from('crm_directory')
        .update({ tags: merged, updated_at: new Date().toISOString() })
        .eq('id', entryId);
      if (error) throw new Error(formatError(error));
      break;
    }
    case 'merge': {
      const related = Array.isArray((suggested as { related?: unknown }).related)
        ? ((suggested as { related: unknown[] }).related).map(String)
        : relatedEntryIds;
      for (const dupId of related) {
        if (dupId && dupId !== entryId) {
          const { error } = await supabase.rpc('merge_directory_entries', {
            p_primary: entryId,
            p_duplicate: dupId,
          });
          if (error) throw new Error(formatError(error));
        }
      }
      break;
    }
    case 'keep_separate': {
      const groupIds = Array.isArray((suggested as { entry_ids?: unknown }).entry_ids)
        ? ((suggested as { entry_ids: unknown[] }).entry_ids).map(String)
        : [...new Set([entryId, ...relatedEntryIds].filter(Boolean) as string[])];

      const { data: openDuplicates, error: dupError } = await supabase
        .from('crm_directory_issues')
        .select('id')
        .in('issue_type', DUPLICATE_ISSUE_TYPES)
        .eq('status', 'open')
        .in('entry_id', groupIds);
      if (dupError) throw new Error(formatError(dupError));

      const issueIds = new Set<string>();
      if (suggestion.issue_id) issueIds.add(suggestion.issue_id);
      for (const row of (openDuplicates ?? []) as Row[]) issueIds.add(row.id);

      for (const issueId of issueIds) {
        const { error } = await supabase.rpc('resolve_directory_issue', {
          p_issue_id: issueId,
          p_resolution: 'ai_distinct_persons',
        });
        if (error) throw new Error(formatError(error));
      }
      break;
    }
    default:
      throw new Error(`Tipo de sugerencia no aplicable: ${suggestion.suggestion_type}`);
  }

  const { error } = await supabase.rpc('set_ai_suggestion_status', {
    p_id: suggestion.id,
    p_status: 'applied',
  });
  if (error) throw new Error(formatError(error));
}

// ── Acciones ────────────────────────────────────────────────────────────────

async function getIssueStats(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_directory_issue_stats');
  if (error) throw new Error(formatError(error));
  const raw = (data ?? {}) as { open_total?: number; dismissed_total?: number; by_type?: Row };
  return {
    openTotal: raw.open_total ?? 0,
    dismissedTotal: raw.dismissed_total ?? 0,
    byType: raw.by_type ?? {},
  };
}

async function getSuggestionStats(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_ai_suggestion_stats');
  if (error) throw new Error(formatError(error));
  const raw = (data ?? {}) as {
    open_total?: number;
    applied_total?: number;
    dismissed_total?: number;
    by_type?: Row;
  };
  return {
    openTotal: raw.open_total ?? 0,
    appliedTotal: raw.applied_total ?? 0,
    dismissedTotal: raw.dismissed_total ?? 0,
    byType: raw.by_type ?? {},
  };
}

async function getGlobalSummary(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('crm_directory_ai_suggestions')
    .select('suggested_value, updated_at')
    .eq('dedupe_key', 'summary:global')
    .maybeSingle();
  if (error) throw new Error(formatError(error));
  const value = (data?.suggested_value ?? {}) as { text?: string };
  return { summary: value.text ?? null };
}

async function getSuggestionsForEntries(
  supabase: SupabaseClient,
  entryIds: string[],
): Promise<Record<string, Row>> {
  const out: Record<string, Row> = {};
  const ids = [...new Set(entryIds.filter((id) => typeof id === 'string' && id.trim() !== ''))];
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('crm_directory_ai_suggestions')
    .select('*')
    .eq('status', 'open')
    .neq('suggestion_type', 'summary')
    .in('entry_id', ids)
    .order('confidence', { ascending: false, nullsFirst: false });
  if (error) throw new Error(formatError(error));

  for (const row of (data ?? []) as Row[]) {
    if (!row.entry_id || out[row.entry_id]) continue;
    out[row.entry_id] = mapSuggestionRow(row);
  }
  return out;
}

async function getIssues(supabase: SupabaseClient, filters: Row) {
  const limit = filters?.limit ?? 25;
  const page = filters?.page ?? 0;
  const from = page * limit;
  const to = from + limit - 1;
  const status = filters?.status ?? 'open';

  let query = supabase
    .from('crm_directory_issues')
    .select('*', { count: 'exact' })
    .eq('status', status);
  if (filters?.issueType) query = query.eq('issue_type', filters.issueType);
  query = query
    .order('severity', { ascending: true })
    .order('detected_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(formatError(error));
  const rows = (data ?? []) as Row[];

  const entryIds = new Set<string>();
  for (const row of rows) {
    if (row.entry_id) entryIds.add(row.entry_id);
    for (const rid of row.related_entry_ids ?? []) entryIds.add(rid);
  }
  const entryMap = await fetchEntriesByIds(supabase, [...entryIds]);

  let issues = rows.map((row) =>
    mapIssueRow(row, row.entry_id ? entryMap.get(row.entry_id) ?? null : null),
  );

  if (filters?.search?.trim()) {
    issues = issues.filter((issue) => matchesSearch(issue, filters.search));
  }

  const issueEntryIds = issues
    .map((issue) => issue.entryId)
    .filter((id): id is string => typeof id === 'string');
  if (issueEntryIds.length > 0) {
    try {
      const suggestionMap = await getSuggestionsForEntries(supabase, issueEntryIds);
      issues = issues.map((issue) => ({
        ...issue,
        aiSuggestion: issue.entryId ? suggestionMap[issue.entryId] ?? null : null,
      }));
    } catch {
      /* sin sugerencias: la fila las generará bajo demanda */
    }
  }

  return { issues, totalCount: count ?? issues.length };
}

async function getSuggestions(supabase: SupabaseClient, filters: Row) {
  const limit = filters?.limit ?? 25;
  const page = filters?.page ?? 0;
  const from = page * limit;
  const to = from + limit - 1;
  const status = filters?.status ?? 'open';

  let query = supabase
    .from('crm_directory_ai_suggestions')
    .select('*', { count: 'exact' })
    .eq('status', status)
    .neq('suggestion_type', 'summary');
  if (filters?.suggestionType) query = query.eq('suggestion_type', filters.suggestionType);
  query = query
    .order('confidence', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(formatError(error));
  const rows = (data ?? []) as Row[];

  const entryIds = new Set<string>();
  for (const row of rows) {
    if (row.entry_id) entryIds.add(row.entry_id);
    for (const rid of row.related_entry_ids ?? []) entryIds.add(rid);
  }
  const entryMap = await fetchEntriesByIds(supabase, [...entryIds]);
  const suggestions = rows.map((row) =>
    mapSuggestionRow(row, row.entry_id ? entryMap.get(row.entry_id) ?? null : null),
  );
  return { suggestions, totalCount: count ?? suggestions.length };
}

async function getDuplicateGroup(supabase: SupabaseClient, issue: Row) {
  const ids = new Set<string>();
  if (issue.entryId) ids.add(issue.entryId);
  for (const rid of issue.relatedEntryIds ?? []) ids.add(rid);
  const detailIds = (issue.details?.entry_ids as string[] | undefined) ?? [];
  for (const did of detailIds) ids.add(did);
  const map = await fetchEntriesByIds(supabase, [...ids]);
  return { entries: [...map.values()] };
}

async function unifyContactName(supabase: SupabaseClient, entryId: string) {
  const { data: entry, error } = await supabase
    .from('crm_directory')
    .select('id, full_name, display_name, phone, whatsapp_conversation_id')
    .eq('id', entryId)
    .maybeSingle();
  if (error) throw new Error(formatError(error));
  if (!entry) throw new Error('Entrada no encontrada.');

  const dirName = (entry.display_name ?? '').trim() || (entry.full_name ?? '').trim();
  if (!isUsefulName(dirName)) throw new Error('Sin nombre CRM válido.');

  await syncWaContactName(supabase, entry, dirName);
  await resolveNameMismatchIssues(supabase, entryId);
  return { success: true };
}

async function runDetection(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('detect_directory_issues');
  if (error) throw new Error(formatError(error));
  return { detected: typeof data === 'number' ? data : 0 };
}

/** Sincroniza contact_name + whatsapp_profile_name al nombre CRM limpio. */
async function syncWaNamesClean(
  supabase: SupabaseClient,
  entry: Row,
  desiredName: string,
): Promise<void> {
  if (!isUsefulName(desiredName)) return;
  const phoneKey = directoryPhoneKey(entry.phone ?? null) ?? entry.phone_key ?? null;
  const keys: string[] = [];
  if (phoneKey) {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('stable_key')
      .eq('phone_key', phoneKey)
      .limit(5);
    for (const row of (data ?? []) as Row[]) {
      if (row.stable_key) keys.push(row.stable_key);
    }
  }
  if (entry.whatsapp_conversation_id) keys.push(entry.whatsapp_conversation_id);
  const unique = [...new Set(keys)];
  if (unique.length === 0) return;
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({
      contact_name: desiredName,
      whatsapp_profile_name: desiredName,
    })
    .in('stable_key', unique);
  if (error) throw new Error(formatError(error));
}

async function loadWaNames(
  supabase: SupabaseClient,
  entry: Row,
): Promise<{ contactName: string | null; profileName: string | null }> {
  let conversation: Row | null = null;
  const phoneKey = directoryPhoneKey(entry.phone ?? null) ?? entry.phone_key ?? null;
  if (phoneKey) {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('contact_name, whatsapp_profile_name')
      .eq('phone_key', phoneKey)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    conversation = data ?? null;
  }
  if (!conversation && entry.whatsapp_conversation_id) {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('contact_name, whatsapp_profile_name')
      .eq('stable_key', entry.whatsapp_conversation_id)
      .maybeSingle();
    conversation = data ?? null;
  }
  return {
    contactName: typeof conversation?.contact_name === 'string' ? conversation.contact_name : null,
    profileName:
      typeof conversation?.whatsapp_profile_name === 'string'
        ? conversation.whatsapp_profile_name
        : null,
  };
}

/**
 * Limpieza determinista de issues abiertos:
 * - emoji_name / invalid_name / missing_name: nombre desde strip/WA/Firebase
 * - missing_phone: teléfono desde users/{uid} en Firebase
 */
async function cleanupOpenIssues(
  supabase: SupabaseClient,
  params: { dryRun?: boolean; limit?: number },
) {
  const dryRun = params.dryRun === true; // default: aplicar
  const maxIssues =
    typeof params.limit === 'number' && params.limit > 0
      ? Math.min(Math.floor(params.limit), 5000)
      : 5000;

  const { data: issueRows, error } = await supabase
    .from('crm_directory_issues')
    .select('id, entry_id, issue_type')
    .eq('status', 'open')
    .in('issue_type', ['emoji_name', 'invalid_name', 'missing_name', 'missing_phone'])
    .order('issue_type', { ascending: true })
    .limit(maxIssues);
  if (error) throw new Error(formatError(error));

  const issues = (issueRows ?? []) as Row[];
  const entryIds = [...new Set(issues.map((i) => i.entry_id).filter(Boolean))];
  const entryMap = new Map<string, Row>();
  for (let i = 0; i < entryIds.length; i += 200) {
    const chunk = entryIds.slice(i, i + 200);
    const { data, error: eErr } = await supabase
      .from('crm_directory')
      .select(
        'id, full_name, display_name, phone, phone_key, app_user_id, opt_out, status, whatsapp_conversation_id',
      )
      .in('id', chunk);
    if (eErr) throw new Error(formatError(eErr));
    for (const row of (data ?? []) as Row[]) entryMap.set(row.id, row);
  }

  // Índice de citas para missing_name sin WA usable.
  const profileIndex = await loadClientProfileIndex({
    lookbackMonths: 48,
    serviceId: Deno.env.get('PROSAVIS_SERVICE_ID')?.trim() || undefined,
  });

  const summary = {
    dryRun,
    scanned: issues.length,
    updated: 0,
    skipped: 0,
    errors: [] as { issueId: string; error: string }[],
    byType: {} as Record<string, { fixed: number; skipped: number }>,
    samples: [] as { issueType: string; phone: string | null; from: string | null; to: string | null; field: string }[],
  };
  const bump = (type: string, key: 'fixed' | 'skipped') => {
    if (!summary.byType[type]) summary.byType[type] = { fixed: 0, skipped: 0 };
    summary.byType[type][key] += 1;
  };

  for (const issue of issues) {
    const entry = issue.entry_id ? entryMap.get(issue.entry_id) : null;
    if (!entry || entry.opt_out === true || entry.status === 'opt_out') {
      summary.skipped += 1;
      bump(issue.issue_type, 'skipped');
      continue;
    }

    try {
      const wa = await loadWaNames(supabase, entry);
      const patch: Record<string, unknown> = {};
      let desiredName: string | null = null;
      let field = '';

      if (
        issue.issue_type === 'emoji_name' ||
        issue.issue_type === 'invalid_name' ||
        issue.issue_type === 'missing_name'
      ) {
        desiredName = pickCleanName({
          fullName: entry.full_name ?? null,
          displayName: entry.display_name ?? null,
          contactName: wa.contactName,
          profileName: wa.profileName,
          phone: entry.phone ?? null,
          phoneKey: entry.phone_key ?? null,
        });

        if (!desiredName && entry.app_user_id) {
          const userDoc = await getFirestoreDocument('users', entry.app_user_id);
          desiredName = firestoreUserDisplayName(userDoc);
        }

        if (!desiredName) {
          const profile = resolveProfile(entry, profileIndex);
          if (profile?.name && isUsableDirectoryName(profile.name, entry.phone, entry.phone_key)) {
            desiredName = profile.name.trim();
          }
        }

        if (
          desiredName &&
          isUsableDirectoryName(desiredName, entry.phone, entry.phone_key) &&
          desiredName !== (entry.full_name ?? '').trim()
        ) {
          patch.full_name = desiredName;
          const display = (entry.display_name ?? '').trim();
          if (!display || needsNameFill(display, entry.phone, entry.phone_key)) {
            patch.display_name = desiredName;
          }
          field = 'full_name';
        }
      } else if (issue.issue_type === 'missing_phone') {
        if (entry.phone && String(entry.phone).trim()) {
          summary.skipped += 1;
          bump(issue.issue_type, 'skipped');
          continue;
        }
        let rawPhone: string | null = null;
        if (entry.app_user_id) {
          rawPhone = await getFirestoreUserPhone(entry.app_user_id);
          if (!rawPhone) {
            const profile = profileIndex.byAppUser.get(entry.app_user_id);
            rawPhone = profile?.phone ?? null;
          }
        }
        const normalized = normalizeDirectoryPhoneE164(rawPhone) ??
          (rawPhone ? String(rawPhone).trim() : null);
        if (!normalized || !directoryPhoneKey(normalized)) {
          summary.skipped += 1;
          bump(issue.issue_type, 'skipped');
          continue;
        }
        // Si el teléfono ya existe en otro contacto, fusionar (este → el que tiene phone).
        const phoneKey = directoryPhoneKey(normalized)!;
        const { data: existing } = await supabase
          .from('crm_directory')
          .select('id')
          .eq('phone_key', phoneKey)
          .neq('id', entry.id)
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          if (!dryRun) {
            const { error: mergeErr } = await supabase.rpc('merge_directory_entries', {
              p_primary: existing.id,
              p_duplicate: entry.id,
            });
            if (mergeErr) throw new Error(formatError(mergeErr));
          }
          if (summary.samples.length < 40) {
            summary.samples.push({
              issueType: issue.issue_type,
              phone: normalized,
              from: null,
              to: `merge→${existing.id}`,
              field: 'merge',
            });
          }
          summary.updated += 1;
          bump(issue.issue_type, 'fixed');
          continue;
        }
        patch.phone = normalized;
        field = 'phone';
        desiredName = String(normalized);
      }

      if (Object.keys(patch).length === 0) {
        summary.skipped += 1;
        bump(issue.issue_type, 'skipped');
        continue;
      }

      if (summary.samples.length < 40) {
        summary.samples.push({
          issueType: issue.issue_type,
          phone: entry.phone ?? null,
          from:
            field === 'phone'
              ? entry.phone ?? null
              : entry.full_name ?? null,
          to: field === 'phone' ? String(patch.phone ?? '') : desiredName,
          field,
        });
      }

      if (dryRun) {
        summary.updated += 1;
        bump(issue.issue_type, 'fixed');
        continue;
      }

      // Primero WA (el trigger puede reescribir crm_directory), luego CRM
      // para dejar el nombre limpio como fuente de verdad.
      if (typeof patch.full_name === 'string') {
        await syncWaNamesClean(supabase, entry, patch.full_name);
      }
      patch.updated_at = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('crm_directory')
        .update(patch)
        .eq('id', entry.id);
      if (updErr) throw new Error(formatError(updErr));

      summary.updated += 1;
      bump(issue.issue_type, 'fixed');
    } catch (e) {
      summary.errors.push({
        issueId: issue.id,
        error: e instanceof Error ? e.message : String(e),
      });
      bump(issue.issue_type, 'skipped');
      summary.skipped += 1;
    }
  }

  return summary;
}

type FieldChange = {
  field: string;
  from: unknown;
  to: unknown;
};

type BackfillSample = {
  id: string;
  phone: string | null;
  changes: FieldChange[];
};

function resolveProfile(
  entry: Row,
  index: ClientProfileIndex,
): ClientProfile | null {
  const candidates: ClientProfile[] = [];
  const pk = (entry.phone_key as string | null) ?? phoneLookupKey(entry.phone);
  if (pk) {
    const byPhone = index.byPhoneKey.get(pk);
    if (byPhone) candidates.push(byPhone);
  }
  if (entry.app_user_id) {
    const byUser = index.byAppUser.get(entry.app_user_id);
    if (byUser) candidates.push(byUser);
  }
  if (candidates.length === 0) return null;
  // Preferir el perfil con última cita más reciente.
  return candidates.reduce((best, cur) => {
    if (!best.lastIso) return cur;
    if (!cur.lastIso) return best;
    return cur.lastIso > best.lastIso ? cur : best;
  });
}

function deriveStatusFromLastIso(lastIso: string | null, asOf: Date): 'active' | 'inactive' | null {
  if (!lastIso) return null;
  const threshold = new Date(
    asOf.getTime() - ACTIVE_CLIENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return lastIso >= threshold ? 'active' : 'inactive';
}

/**
 * Cruza crm_directory con citas Firebase por phone_key / app_user_id.
 * Política fill-only: no pisa nombres buenos ni app_user_id existente; nunca toca opt_out.
 */
async function backfillFromFirebase(
  supabase: SupabaseClient,
  params: { dryRun?: boolean; limit?: number; lookbackMonths?: number },
) {
  const dryRun = params.dryRun !== false; // default seguro: dry-run
  const pageSize = 200;
  const maxRows =
    typeof params.limit === 'number' && params.limit > 0
      ? Math.min(Math.floor(params.limit), 50_000)
      : 50_000;
  const lookbackMonths =
    typeof params.lookbackMonths === 'number' && params.lookbackMonths > 0
      ? Math.floor(params.lookbackMonths)
      : CLIENT_APPOINTMENT_LOOKBACK_MONTHS;
  const asOf = new Date();
  const serviceId = Deno.env.get('PROSAVIS_SERVICE_ID')?.trim() || undefined;

  const index = await loadClientProfileIndex({ asOf, lookbackMonths, serviceId });

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { id: string; error: string }[] = [];
  const samples: BackfillSample[] = [];
  const SAMPLE_CAP = 75;

  let offset = 0;
  while (scanned < maxRows) {
    const take = Math.min(pageSize, maxRows - scanned);
    const { data, error } = await supabase
      .from('crm_directory')
      .select(
        'id, full_name, display_name, phone, phone_key, app_user_id, is_app_user, status, opt_out, pending_appointments_count, whatsapp_conversation_id',
      )
      .not('phone_key', 'is', null)
      .eq('opt_out', false)
      .neq('status', 'opt_out')
      .order('id', { ascending: true })
      .range(offset, offset + take - 1);
    if (error) throw new Error(formatError(error));

    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    offset += rows.length;

    for (const entry of rows) {
      scanned += 1;
      if (entry.opt_out === true || entry.status === 'opt_out') {
        skipped += 1;
        continue;
      }

      const currentName =
        (typeof entry.display_name === 'string' && entry.display_name.trim()
          ? entry.display_name
          : entry.full_name) as string | null;
      const needsName = needsNameFill(currentName, entry.phone, entry.phone_key);
      const needsAppUser = !entry.app_user_id;
      // Candidatos: nombre malo/vacío o sin app_user_id (citas/estado se rellenan al match).
      if (!needsName && !needsAppUser) {
        skipped += 1;
        continue;
      }

      const profile = resolveProfile(entry, index);
      if (!profile) {
        skipped += 1;
        continue;
      }

      const patch: Record<string, unknown> = {};
      const changes: FieldChange[] = [];

      if (needsName && isUsableFirebaseName(profile.name)) {
        const newName = (profile.name as string).trim();
        if ((entry.full_name ?? '').trim() !== newName) {
          patch.full_name = newName;
          changes.push({ field: 'full_name', from: entry.full_name ?? null, to: newName });
        }
        const currentDisplay = (entry.display_name ?? '').trim();
        if (!currentDisplay || needsNameFill(currentDisplay, entry.phone, entry.phone_key)) {
          if (currentDisplay !== newName) {
            patch.display_name = newName;
            changes.push({
              field: 'display_name',
              from: entry.display_name ?? null,
              to: newName,
            });
          }
        }
      }

      if (needsAppUser && profile.appUserId) {
        patch.app_user_id = profile.appUserId;
        patch.is_app_user = true;
        changes.push({
          field: 'app_user_id',
          from: entry.app_user_id ?? null,
          to: profile.appUserId,
        });
        changes.push({
          field: 'is_app_user',
          from: entry.is_app_user ?? false,
          to: true,
        });
      }

      if (
        entry.pending_appointments_count == null ||
        (Number(entry.pending_appointments_count) === 0 && profile.count > 0)
      ) {
        if (Number(entry.pending_appointments_count ?? 0) !== profile.count) {
          patch.pending_appointments_count = profile.count;
          changes.push({
            field: 'pending_appointments_count',
            from: entry.pending_appointments_count ?? null,
            to: profile.count,
          });
        }
      }

      const derivedStatus = deriveStatusFromLastIso(profile.lastIso, asOf);
      if (
        derivedStatus &&
        entry.status !== derivedStatus &&
        entry.status !== 'opt_out'
      ) {
        patch.status = derivedStatus;
        changes.push({
          field: 'status',
          from: entry.status ?? null,
          to: derivedStatus,
        });
      }

      if (changes.length === 0) {
        skipped += 1;
        continue;
      }

      wouldUpdate += 1;
      if (samples.length < SAMPLE_CAP) {
        samples.push({
          id: entry.id,
          phone: entry.phone ?? null,
          changes,
        });
      }

      if (dryRun) continue;

      try {
        patch.updated_at = asOf.toISOString();
        const { error: updErr } = await supabase
          .from('crm_directory')
          .update(patch)
          .eq('id', entry.id);
        if (updErr) throw new Error(formatError(updErr));

        if (typeof patch.full_name === 'string' || typeof patch.display_name === 'string') {
          const desired =
            (typeof patch.display_name === 'string' ? patch.display_name : null) ??
            (typeof patch.full_name === 'string' ? patch.full_name : null);
          if (desired) {
            await syncWaContactName(supabase, entry, desired);
          }
        }
        updated += 1;
      } catch (e) {
        errors.push({
          id: entry.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (rows.length < take) break;
  }

  if (dryRun) {
    return {
      dryRun: true,
      total: scanned,
      wouldUpdate,
      skipped,
      indexSize: {
        byPhoneKey: index.byPhoneKey.size,
        byAppUser: index.byAppUser.size,
        appointments: index.appointmentCount,
      },
      lookbackMonths,
      samples,
    };
  }

  return {
    dryRun: false,
    total: scanned,
    updated,
    wouldUpdate,
    skipped,
    errors,
    indexSize: {
      byPhoneKey: index.byPhoneKey.size,
      byAppUser: index.byAppUser.size,
      appointments: index.appointmentCount,
    },
    lookbackMonths,
    samples,
  };
}

async function applySuggestions(supabase: SupabaseClient, suggestionIds: string[]) {
  const ids = [...new Set(suggestionIds.filter((id) => typeof id === 'string' && id.trim() !== ''))];
  if (ids.length === 0) return { applied: 0, failed: 0, errors: [] as Row[] };

  const { data, error } = await supabase
    .from('crm_directory_ai_suggestions')
    .select('*')
    .in('id', ids)
    .eq('status', 'open');
  if (error) throw new Error(formatError(error));
  const rows = (data ?? []) as Row[];

  // 'merge' al final: fusionar puede afectar entradas de otras sugerencias del lote.
  const order = (t: string) => (t === 'merge' ? 1 : 0);
  rows.sort((a, b) => order(a.suggestion_type) - order(b.suggestion_type));

  let applied = 0;
  const errors: Row[] = [];
  for (const row of rows) {
    try {
      await applySuggestionRow(supabase, row);
      applied += 1;
    } catch (e) {
      errors.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { applied, failed: errors.length, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireDirectoryAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '').trim();

    switch (action) {
      case 'getIssueStats':
        return jsonResponse(await getIssueStats(supabase));
      case 'getSuggestionStats':
        return jsonResponse(await getSuggestionStats(supabase));
      case 'getGlobalSummary':
        return jsonResponse(await getGlobalSummary(supabase));
      case 'getIssues':
        return jsonResponse(await getIssues(supabase, body.filters ?? {}));
      case 'getSuggestions':
        return jsonResponse(await getSuggestions(supabase, body.filters ?? {}));
      case 'getSuggestionsForEntries':
        return jsonResponse({
          suggestions: await getSuggestionsForEntries(supabase, body.entryIds ?? []),
        });
      case 'getDuplicateGroup':
        return jsonResponse(await getDuplicateGroup(supabase, body.issue ?? {}));
      case 'dismissIssue': {
        const { error } = await supabase.rpc('resolve_directory_issue', {
          p_issue_id: String(body.issueId ?? ''),
          p_resolution: 'dismissed',
        });
        if (error) throw new Error(formatError(error));
        return jsonResponse({ success: true });
      }
      case 'dismissSuggestion': {
        const { error } = await supabase.rpc('set_ai_suggestion_status', {
          p_id: String(body.id ?? ''),
          p_status: 'dismissed',
        });
        if (error) throw new Error(formatError(error));
        return jsonResponse({ success: true });
      }
      case 'mergeEntries': {
        const { error } = await supabase.rpc('merge_directory_entries', {
          p_primary: String(body.primaryId ?? ''),
          p_duplicate: String(body.duplicateId ?? ''),
        });
        if (error) throw new Error(formatError(error));
        return jsonResponse({ success: true });
      }
      case 'unifyContactName':
        return jsonResponse(await unifyContactName(supabase, String(body.entryId ?? '')));
      case 'applySuggestion': {
        const { data, error } = await supabase
          .from('crm_directory_ai_suggestions')
          .select('*')
          .eq('id', String(body.suggestionId ?? ''))
          .maybeSingle();
        if (error) throw new Error(formatError(error));
        if (!data) throw new Error('Sugerencia no encontrada.');
        await applySuggestionRow(supabase, data);
        return jsonResponse({ success: true });
      }
      case 'applySuggestions':
        return jsonResponse(await applySuggestions(supabase, body.suggestionIds ?? []));
      case 'analyze':
        return jsonResponse(await runDirectoryAnalysis(supabase, body));
      case 'runDetection':
        return jsonResponse(await runDetection(supabase));
      case 'backfillFromFirebase':
        return jsonResponse(
          await backfillFromFirebase(supabase, {
            dryRun: body.dryRun !== false,
            limit: body.limit,
            lookbackMonths: body.lookbackMonths,
          }),
        );
      case 'cleanupOpenIssues':
        return jsonResponse(
          await cleanupOpenIssues(supabase, {
            dryRun: body.dryRun === true,
            limit: body.limit,
          }),
        );
      default:
        return jsonResponse({ error: `Acción no soportada: ${action || '(vacía)'}` }, 400);
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = formatError(error);
    if (message.includes('GEMINI_API_KEY')) {
      return jsonResponse({ error: message }, 412);
    }
    return jsonResponse({ error: message }, 500);
  }
});

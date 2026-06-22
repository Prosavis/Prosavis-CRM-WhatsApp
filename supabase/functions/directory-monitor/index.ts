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

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const DUPLICATE_ISSUE_TYPES = ['duplicate_phone', 'duplicate_email', 'duplicate_name'];

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

function isUsefulName(value: string | null | undefined, minLen = 2): boolean {
  return (value ?? '').trim().length >= minLen;
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

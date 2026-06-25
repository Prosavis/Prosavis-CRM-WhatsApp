import { supabase } from '@/config/supabase';
import { directoryService, mapRowToEntry } from '@/services/directoryService';
import { patchWhatsAppConversationAdmin } from '@/services/whatsappService';
import type { Database } from '@/types/database';
import {
  pickDirectoryDisplayName,
  shouldSyncContactNameFromDirectory,
} from '@/utils/contactDisplayName';
import { directoryPhoneKey } from '@/utils/directoryPhone';
import type {
  AIAnalyzeResult,
  AISuggestionStats,
  AISuggestionStatus,
  AISuggestionType,
  DirectoryAISuggestion,
  DirectoryEntry,
  DirectoryIssue,
  DirectoryIssueStats,
  DirectoryIssueStatus,
  DirectoryIssueType,
} from '@/types/lead';

type DirectoryRow = Database['public']['Tables']['crm_directory']['Row'];

function logDirectoryAI(event: string, data?: Record<string, unknown>): void {
  console.info(`[directory-ai] ${event}`, data ?? '');
}

interface IssueRow {
  id: string;
  entry_id: string | null;
  related_entry_ids: string[] | null;
  issue_type: DirectoryIssueType;
  severity: 'warning' | 'error';
  status: DirectoryIssueStatus;
  details: Record<string, unknown> | null;
  detected_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
}

function mapIssueRow(row: IssueRow, entry?: DirectoryEntry | null): DirectoryIssue {
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

export interface DirectoryIssueFilters {
  issueType?: DirectoryIssueType;
  status?: DirectoryIssueStatus;
  search?: string;
  page?: number;
  limit?: number;
}

interface SuggestionRow {
  id: string;
  entry_id: string | null;
  issue_id: string | null;
  suggestion_type: AISuggestionType;
  field: string | null;
  current_value: Record<string, unknown> | null;
  suggested_value: Record<string, unknown> | null;
  confidence: number | null;
  reason: string | null;
  related_entry_ids: string[] | null;
  status: AISuggestionStatus;
  model: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  applied_by: string | null;
}

function mapSuggestionRow(row: SuggestionRow, entry?: DirectoryEntry | null): DirectoryAISuggestion {
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

export interface AISuggestionFilters {
  suggestionType?: AISuggestionType;
  status?: AISuggestionStatus;
  page?: number;
  limit?: number;
}

async function fetchEntriesByIds(ids: string[]): Promise<Map<string, DirectoryEntry>> {
  const map = new Map<string, DirectoryEntry>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('crm_directory')
    .select('*')
    .in('id', ids);
  if (error) throw error;

  for (const row of (data ?? []) as DirectoryRow[]) {
    const entry = mapRowToEntry(row);
    map.set(entry.id, entry);
  }
  return map;
}

function matchesSearch(issue: DirectoryIssue, term: string): boolean {
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

export const directoryMonitorService = {
  /** Conteos por categoría y estado para los chips del panel. */
  async getIssueStats(): Promise<DirectoryIssueStats> {
    const { data, error } = await supabase.rpc('get_directory_issue_stats');
    if (error) throw error;
    const raw = (data ?? {}) as {
      open_total?: number;
      dismissed_total?: number;
      by_type?: Record<string, number>;
    };
    return {
      openTotal: raw.open_total ?? 0,
      dismissedTotal: raw.dismissed_total ?? 0,
      byType: (raw.by_type ?? {}) as Partial<Record<DirectoryIssueType, number>>,
    };
  },

  /**
   * Lista paginada de issues con su entrada principal y duplicados relacionados.
   * La búsqueda se aplica sobre la página cargada (nombre/teléfono/email).
   */
  async getIssues(filters?: DirectoryIssueFilters): Promise<{
    issues: DirectoryIssue[];
    totalCount: number;
  }> {
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
    if (error) throw error;

    const rows = (data ?? []) as IssueRow[];

    const entryIds = new Set<string>();
    for (const row of rows) {
      if (row.entry_id) entryIds.add(row.entry_id);
      for (const rid of row.related_entry_ids ?? []) entryIds.add(rid);
    }
    const entryMap = await fetchEntriesByIds([...entryIds]);

    let issues = rows.map((row) => {
      const issue = mapIssueRow(row, row.entry_id ? entryMap.get(row.entry_id) : null);
      return issue;
    });

    if (filters?.search?.trim()) {
      issues = issues.filter((issue) => matchesSearch(issue, filters.search ?? ''));
    }

    // Adjunta a cada issue su sugerencia IA abierta (si existe) para la acción por fila.
    const issueEntryIds = issues
      .map((issue) => issue.entryId)
      .filter((id): id is string => typeof id === 'string');
    if (issueEntryIds.length > 0) {
      try {
        const suggestionMap = await this.getSuggestionsForEntries(issueEntryIds);
        issues = issues.map((issue) => ({
          ...issue,
          aiSuggestion: issue.entryId ? suggestionMap.get(issue.entryId) ?? null : null,
        }));
      } catch {
        /* sin sugerencias: la fila simplemente generará bajo demanda */
      }
    }

    return { issues, totalCount: count ?? issues.length };
  },

  /**
   * Devuelve las sugerencias IA abiertas (excluye 'summary') para un conjunto de entradas,
   * indexadas por entryId y ordenadas por mayor confianza.
   */
  async getSuggestionsForEntries(entryIds: string[]): Promise<Map<string, DirectoryAISuggestion>> {
    const map = new Map<string, DirectoryAISuggestion>();
    const ids = [...new Set(entryIds.filter((id) => typeof id === 'string' && id.trim() !== ''))];
    if (ids.length === 0) return map;

    const { data, error } = await supabase
      .from('crm_directory_ai_suggestions')
      .select('*')
      .eq('status', 'open')
      .neq('suggestion_type', 'summary')
      .in('entry_id', ids)
      .order('confidence', { ascending: false, nullsFirst: false });
    if (error) throw error;

    for (const row of (data ?? []) as SuggestionRow[]) {
      if (!row.entry_id || map.has(row.entry_id)) continue;
      map.set(row.entry_id, mapSuggestionRow(row));
    }
    return map;
  },

  /** Devuelve las entradas de un grupo de duplicados (principal + relacionadas). */
  async getDuplicateGroup(issue: DirectoryIssue): Promise<DirectoryEntry[]> {
    const ids = new Set<string>();
    if (issue.entryId) ids.add(issue.entryId);
    for (const rid of issue.relatedEntryIds) ids.add(rid);
    const detailIds = (issue.details?.entry_ids as string[] | undefined) ?? [];
    for (const did of detailIds) ids.add(did);

    const map = await fetchEntriesByIds([...ids]);
    return [...map.values()];
  },

  /** Descarta un issue (revisión humana: se ignora). */
  async dismissIssue(issueId: string): Promise<void> {
    const { error } = await supabase.rpc('resolve_directory_issue', {
      p_issue_id: issueId,
      p_resolution: 'dismissed',
    });
    if (error) throw error;
  },

  /** Fusiona el duplicado dentro de la entrada principal. */
  async mergeEntries(primaryId: string, duplicateId: string): Promise<void> {
    const { error } = await supabase.rpc('merge_directory_entries', {
      p_primary: primaryId,
      p_duplicate: duplicateId,
    });
    if (error) throw error;
  },

  /** Sincroniza contact_name de WhatsApp desde el nombre canónico del directorio. */
  async unifyContactNameFromDirectory(entryId: string): Promise<void> {
    const entry = await directoryService.getEntryById(entryId);
    if (!entry) throw new Error('Entrada no encontrada');

    const dirName = pickDirectoryDisplayName(entry);
    if (!dirName) throw new Error('Sin nombre CRM válido');

    let conversationId = entry.whatsAppConversationId;
    if (!conversationId && entry.phone) {
      const key = directoryPhoneKey(entry.phone);
      if (key) {
        const { data, error } = await supabase
          .from('whatsapp_conversations')
          .select('id')
          .eq('phone_key', key)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        conversationId = data?.id ?? undefined;
      }
    }

    if (!conversationId) throw new Error('Sin conversación WhatsApp vinculada');

    await patchWhatsAppConversationAdmin({
      conversationId,
      patch: { contactName: dirName },
    });

    const { data: openIssues, error: issuesError } = await supabase
      .from('crm_directory_issues')
      .select('id')
      .eq('entry_id', entryId)
      .eq('issue_type', 'name_wa_mismatch')
      .eq('status', 'open');
    if (issuesError) throw issuesError;

    for (const row of openIssues ?? []) {
      const { error } = await supabase.rpc('resolve_directory_issue', {
        p_issue_id: row.id,
        p_resolution: 'auto_sync_crm_name',
      });
      if (error) throw error;
    }
  },

  // ── IA (Gemini) ───────────────────────────────────────────────────────────

  /** Escaneo manual de inconsistencias vía Edge Function unificada (sin modificar contactos). */
  async runDetection(): Promise<{ detected: number }> {
    const { data, error } = await supabase.functions.invoke<{ detected: number }>('directory-monitor', {
      body: { action: 'runDetection' },
    });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const raw = await ctx.text().catch(() => '');
        if (raw) {
          let parsedError: string | null = null;
          try {
            const payload = JSON.parse(raw) as { error?: unknown };
            if (payload && typeof payload === 'object' && 'error' in payload) {
              parsedError = String(payload.error);
            }
          } catch {
            parsedError = raw.slice(0, 500);
          }
          if (parsedError) throw new Error(`HTTP ${ctx.status}: ${parsedError}`);
        }
      }
      throw error;
    }
    return data ?? { detected: 0 };
  },

  /**
   * Lanza una pasada de análisis con IA (Edge Function). La IA solo propone sugerencias.
   * Procesa un lote de issues pendientes y devuelve `remaining`; para cubrir toda la
   * tabla, usa `analyzeAllWithAI` que itera hasta agotar los pendientes.
   */
  async analyzeWithAI(params?: {
    issueType?: DirectoryIssueType;
    entryIds?: string[];
    issueIds?: string[];
    force?: boolean;
    limit?: number;
    batchSize?: number;
    reanalyze?: boolean;
  }): Promise<AIAnalyzeResult> {
    logDirectoryAI('invoke', {
      issueType: params?.issueType,
      batchSize: params?.batchSize,
      limit: params?.limit,
      reanalyze: params?.reanalyze,
      entryIds: params?.entryIds?.length,
      issueIds: params?.issueIds?.length,
      force: params?.force,
    });
    const started = Date.now();
    const { data, error } = await supabase.functions.invoke<AIAnalyzeResult>('directory-ai-analyze', {
      body: {
        issueType: params?.issueType,
        entryIds: params?.entryIds,
        issueIds: params?.issueIds,
        force: params?.force,
        limit: params?.limit,
        batchSize: params?.batchSize,
        reanalyze: params?.reanalyze,
      },
    });
    if (error) {
      logDirectoryAI('invoke_error', {
        elapsedMs: Date.now() - started,
        message: error.message,
      });
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const raw = await ctx.text().catch(() => '');
        if (raw) {
          let parsedError: string | null = null;
          try {
            const payload = JSON.parse(raw) as { error?: unknown };
            if (payload && typeof payload === 'object' && 'error' in payload) {
              parsedError = String(payload.error);
            }
          } catch {
            parsedError = raw.slice(0, 500);
          }
          if (parsedError) {
            throw new Error(`HTTP ${ctx.status}: ${parsedError}`);
          }
        }
      }
      throw error;
    }
    const result = data ?? { analyzed: 0, created: 0, summary: '', remaining: 0 };
    logDirectoryAI('invoke_ok', {
      elapsedMs: Date.now() - started,
      analyzed: result.analyzed,
      created: result.created,
      remaining: result.remaining,
      model: result.model,
      modelConfigured: result.modelConfigured,
      modelOverridden: result.modelOverridden,
      batchSizeUsed: result.batchSizeUsed,
      retries: result.retries,
      failedBatches: result.failedBatches,
      finishReason: result.finishReason,
      lastError: result.lastError,
      partialSuccess: result.partialSuccess,
    });
    return result;
  },

  /**
   * Recorre TODA la tabla: invoca el análisis por lotes hasta que no queden issues
   * pendientes (`remaining === 0`). Informa el progreso vía callback.
   */
  async analyzeAllWithAI(
    params?: { issueType?: DirectoryIssueType; reanalyze?: boolean },
    onProgress?: (p: {
      analyzedTotal: number;
      createdTotal: number;
      remaining: number;
      model?: string;
      failedBatches?: number;
    }) => void,
  ): Promise<AIAnalyzeResult & { failedBatchesTotal: number }> {
    let analyzedTotal = 0;
    let createdTotal = 0;
    let failedBatchesTotal = 0;
    let consecutiveFailures = 0;
    let lastSummary = '';
    let model: string | undefined;
    const MAX_PASSES = 500;
    const MAX_CONSECUTIVE_FAILURES = 3;

    logDirectoryAI('analyze_all_start', { issueType: params?.issueType, reanalyze: params?.reanalyze });

    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      let result: AIAnalyzeResult;
      try {
        result = await this.analyzeWithAI({
          issueType: params?.issueType,
          batchSize: 5,
          reanalyze: params?.reanalyze && pass === 0,
        });
        consecutiveFailures = 0;
      } catch (err) {
        failedBatchesTotal += 1;
        consecutiveFailures += 1;
        const message = err instanceof Error ? err.message : String(err);
        logDirectoryAI('pass_failed', {
          pass: pass + 1,
          failedBatchesTotal,
          consecutiveFailures,
          error: message,
        });
        onProgress?.({
          analyzedTotal,
          createdTotal,
          remaining: -1,
          model,
          failedBatches: failedBatchesTotal,
        });
        // Circuit breaker: si la función falla repetidamente (p.ej. 500 persistente),
        // abortamos con el mensaje real en lugar de martillar cientos de pasadas.
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logDirectoryAI('analyze_all_aborted', {
            passes: pass + 1,
            consecutiveFailures,
            failedBatchesTotal,
            error: message,
          });
          throw new Error(
            `El análisis con IA falló ${consecutiveFailures} veces seguidas y se detuvo. Último error: ${message}`,
            { cause: err },
          );
        }
        const remainingGuess = await supabase
          .from('crm_directory_issues')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
          .is('ai_analyzed_at', null);
        const remaining = remainingGuess.count ?? 0;
        if (remaining <= 0) break;
        continue;
      }

      analyzedTotal += result.analyzed;
      createdTotal += result.created;
      failedBatchesTotal += result.failedBatches ?? 0;
      lastSummary = result.summary || lastSummary;
      model = result.model ?? model;
      const remaining = result.remaining ?? 0;
      onProgress?.({ analyzedTotal, createdTotal, remaining, model, failedBatches: failedBatchesTotal });

      if (remaining <= 0 || result.analyzed === 0) {
        logDirectoryAI('analyze_all_done', {
          passes: pass + 1,
          analyzedTotal,
          createdTotal,
          failedBatchesTotal,
          model,
        });
        return {
          analyzed: analyzedTotal,
          created: createdTotal,
          summary: lastSummary,
          remaining,
          model,
          failedBatchesTotal,
        };
      }
    }
    return {
      analyzed: analyzedTotal,
      created: createdTotal,
      summary: lastSummary,
      remaining: 0,
      model,
      failedBatchesTotal,
    };
  },

  /**
   * Genera (bajo demanda) la sugerencia IA para una sola inconsistencia: invoca la Edge
   * Function en modo dirigido (`entryIds` + `force`) y recupera la propuesta resultante.
   * Devuelve `null` si la IA no propuso nada seguro para esa entrada.
   */
  async generateSuggestionForIssue(issue: DirectoryIssue): Promise<DirectoryAISuggestion | null> {
    if (!issue.entryId) throw new Error('La inconsistencia no tiene entrada asociada.');
    await this.analyzeWithAI({ entryIds: [issue.entryId], force: true });
    const map = await this.getSuggestionsForEntries([issue.entryId]);
    return map.get(issue.entryId) ?? null;
  },

  /** Conteos de sugerencias por tipo y estado. */
  async getSuggestionStats(): Promise<AISuggestionStats> {
    const { data, error } = await supabase.rpc('get_ai_suggestion_stats');
    if (error) throw error;
    const raw = (data ?? {}) as {
      open_total?: number;
      applied_total?: number;
      dismissed_total?: number;
      by_type?: Record<string, number>;
    };
    return {
      openTotal: raw.open_total ?? 0,
      appliedTotal: raw.applied_total ?? 0,
      dismissedTotal: raw.dismissed_total ?? 0,
      byType: (raw.by_type ?? {}) as Partial<Record<AISuggestionType, number>>,
    };
  },

  /** Texto del último resumen global generado por la IA. */
  async getGlobalSummary(): Promise<string | null> {
    const { data, error } = await supabase
      .from('crm_directory_ai_suggestions')
      .select('suggested_value, updated_at')
      .eq('dedupe_key', 'summary:global')
      .maybeSingle();
    if (error) throw error;
    const value = (data?.suggested_value ?? {}) as { text?: string };
    return value.text ?? null;
  },

  /** Lista de sugerencias (excluye 'summary') con su entrada principal. */
  async getSuggestions(filters?: AISuggestionFilters): Promise<{
    suggestions: DirectoryAISuggestion[];
    totalCount: number;
  }> {
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
    if (error) throw error;

    const rows = (data ?? []) as SuggestionRow[];
    const entryIds = new Set<string>();
    for (const row of rows) {
      if (row.entry_id) entryIds.add(row.entry_id);
      for (const rid of row.related_entry_ids ?? []) entryIds.add(rid);
    }
    const entryMap = await fetchEntriesByIds([...entryIds]);

    const suggestions = rows.map((row) =>
      mapSuggestionRow(row, row.entry_id ? entryMap.get(row.entry_id) : null),
    );

    return { suggestions, totalCount: count ?? suggestions.length };
  },

  /** Marca una sugerencia como descartada (sin aplicar). */
  async dismissSuggestion(id: string): Promise<void> {
    const { error } = await supabase.rpc('set_ai_suggestion_status', { p_id: id, p_status: 'dismissed' });
    if (error) throw error;
  },

  /**
   * Aplica una sugerencia (acción del humano).
   * La escritura usa los caminos existentes (upsert_directory_entry / merge),
   * y luego marca la sugerencia como 'applied'.
   */
  async applySuggestion(suggestion: DirectoryAISuggestion): Promise<void> {
    if (!suggestion.entryId) throw new Error('La sugerencia no tiene entrada asociada.');

    switch (suggestion.suggestionType) {
      case 'name_cleanup': {
        const suggested = suggestion.suggestedValue as { value?: unknown; contact_name?: unknown };
        const value = String(suggested.value ?? '').trim();
        const contactName = String(suggested.contact_name ?? value).trim();
        if (!value && !contactName) throw new Error('Sugerencia de nombre vacía.');
        if (value) {
          await directoryService.updateEntry(suggestion.entryId, { fullName: value });
        }

        const entry = await directoryService.getEntryById(suggestion.entryId);
        let conversationId = entry?.whatsAppConversationId;
        if (!conversationId && entry?.phone) {
          const key = directoryPhoneKey(entry.phone);
          if (key) {
            const { data } = await supabase
              .from('whatsapp_conversations')
              .select('id, contact_name')
              .eq('phone_key', key)
              .order('last_message_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            conversationId = data?.id ?? undefined;
            if (
              conversationId
              && data
              && shouldSyncContactNameFromDirectory(contactName || value, data.contact_name)
            ) {
              await patchWhatsAppConversationAdmin({
                conversationId,
                patch: { contactName: contactName || value },
              });
            }
          }
        } else if (conversationId && contactName) {
          await patchWhatsAppConversationAdmin({
            conversationId,
            patch: { contactName },
          });
        }

        const { data: openIssues } = await supabase
          .from('crm_directory_issues')
          .select('id')
          .eq('entry_id', suggestion.entryId)
          .eq('issue_type', 'name_wa_mismatch')
          .eq('status', 'open');
        for (const row of openIssues ?? []) {
          await supabase.rpc('resolve_directory_issue', {
            p_issue_id: row.id,
            p_resolution: 'auto_sync_crm_name',
          });
        }
        break;
      }
      case 'phone_fix': {
        const value = String((suggestion.suggestedValue as { value?: unknown }).value ?? '').trim();
        if (!value) throw new Error('Sugerencia de teléfono vacía.');
        await directoryService.updateEntry(suggestion.entryId, { phone: value });
        break;
      }
      case 'tag_suggestion': {
        const suggested = (suggestion.suggestedValue as { value?: unknown }).value;
        const newTags = Array.isArray(suggested) ? suggested.map(String) : [];
        const existing = await directoryService.getEntryById(suggestion.entryId);
        const merged = [...new Set([...(existing?.tags ?? []), ...newTags])];
        await directoryService.updateEntry(suggestion.entryId, { tags: merged });
        break;
      }
      case 'merge': {
        const related = (suggestion.suggestedValue as { related?: unknown }).related;
        const dupIds = Array.isArray(related) ? related.map(String) : suggestion.relatedEntryIds;
        for (const dupId of dupIds) {
          if (dupId && dupId !== suggestion.entryId) {
            await this.mergeEntries(suggestion.entryId, dupId);
          }
        }
        break;
      }
      case 'keep_separate': {
        // Personas distintas: NO se fusiona crm_directory. Solo se resuelve la(s)
        // inconsistencia(s) de duplicado del grupo como "distintas según IA".
        const suggested = suggestion.suggestedValue as { entry_ids?: unknown };
        const groupIds = Array.isArray(suggested.entry_ids)
          ? suggested.entry_ids.map(String)
          : [...new Set([suggestion.entryId, ...suggestion.relatedEntryIds])];

        const { data: openDuplicates, error: dupError } = await supabase
          .from('crm_directory_issues')
          .select('id')
          .in('issue_type', ['duplicate_phone', 'duplicate_email', 'duplicate_name'])
          .eq('status', 'open')
          .in('entry_id', groupIds);
        if (dupError) throw dupError;

        const issueIds = new Set<string>();
        if (suggestion.issueId) issueIds.add(suggestion.issueId);
        for (const row of openDuplicates ?? []) issueIds.add(row.id);

        for (const issueId of issueIds) {
          const { error } = await supabase.rpc('resolve_directory_issue', {
            p_issue_id: issueId,
            p_resolution: 'ai_distinct_persons',
          });
          if (error) throw error;
        }
        break;
      }
      default:
        throw new Error(`Tipo de sugerencia no aplicable: ${suggestion.suggestionType}`);
    }

    const { error } = await supabase.rpc('set_ai_suggestion_status', {
      p_id: suggestion.id,
      p_status: 'applied',
    });
    if (error) throw error;
  },

  /**
   * Aplica varias sugerencias de una sola pasada delegando en la Edge Function
   * unificada `directory-monitor` (acción `applySuggestions`). El backend ejecuta
   * la misma lógica de `applySuggestion` por cada id y devuelve el conteo de
   * aplicadas/fallidas para informar al usuario.
   */
  async applySuggestionsBulk(suggestionIds: string[]): Promise<{
    applied: number;
    failed: number;
    errors: { id: string; error: string }[];
  }> {
    const ids = [...new Set(suggestionIds.filter((id) => typeof id === 'string' && id.trim() !== ''))];
    if (ids.length === 0) return { applied: 0, failed: 0, errors: [] };

    const { data, error } = await supabase.functions.invoke<{
      applied: number;
      failed: number;
      errors: { id: string; error: string }[];
    }>('directory-monitor', {
      body: { action: 'applySuggestions', suggestionIds: ids },
    });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const raw = await ctx.text().catch(() => '');
        if (raw) {
          let parsedError: string | null = null;
          try {
            const payload = JSON.parse(raw) as { error?: unknown };
            if (payload && typeof payload === 'object' && 'error' in payload) {
              parsedError = String(payload.error);
            }
          } catch {
            parsedError = raw.slice(0, 500);
          }
          if (parsedError) throw new Error(`HTTP ${ctx.status}: ${parsedError}`);
        }
      }
      throw error;
    }
    return data ?? { applied: 0, failed: 0, errors: [] };
  },
};

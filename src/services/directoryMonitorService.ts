import { supabase } from '@/config/supabase';
import { directoryService, mapRowToEntry } from '@/services/directoryService';
import type { Database } from '@/types/database';
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

    return { issues, totalCount: count ?? issues.length };
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

  // ── IA (Gemini) ───────────────────────────────────────────────────────────

  /** Lanza el análisis con IA (Edge Function). La IA solo propone sugerencias. */
  async analyzeWithAI(params?: {
    issueType?: DirectoryIssueType;
    entryIds?: string[];
    limit?: number;
  }): Promise<AIAnalyzeResult> {
    const { data, error } = await supabase.functions.invoke<AIAnalyzeResult>('directory-ai-analyze', {
      body: {
        issueType: params?.issueType,
        entryIds: params?.entryIds,
        limit: params?.limit,
      },
    });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const payload = await ctx.json().catch(() => null);
        if (payload && typeof payload === 'object' && 'error' in payload) {
          throw new Error(String((payload as { error: unknown }).error));
        }
      }
      throw error;
    }
    return data ?? { analyzed: 0, created: 0, summary: '' };
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
        const value = String((suggestion.suggestedValue as { value?: unknown }).value ?? '').trim();
        if (!value) throw new Error('Sugerencia de nombre vacía.');
        await directoryService.updateEntry(suggestion.entryId, { fullName: value });
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
      default:
        throw new Error(`Tipo de sugerencia no aplicable: ${suggestion.suggestionType}`);
    }

    const { error } = await supabase.rpc('set_ai_suggestion_status', {
      p_id: suggestion.id,
      p_status: 'applied',
    });
    if (error) throw error;
  },
};

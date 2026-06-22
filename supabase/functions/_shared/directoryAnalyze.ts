// Lógica compartida de análisis de calidad del directorio con Gemini.
// La IA solo PROPONE (no aplica) arreglos sobre crm_directory a partir de los
// issues abiertos del orquestador. Extraído de `directory-ai-analyze` para que
// tanto esa función como `directory-monitor` reutilicen exactamente el mismo
// motor de análisis sin duplicar prompts ni lógica de lotes.

import { formatError } from './errors.ts';
import {
  getGeminiApiKey,
  geminiGenerateJsonWithMeta,
  geminiLog,
  isGeminiMaxTokensError,
  resolveDirectoryAnalysisModel,
  DEFAULT_GEMINI_MODEL,
} from './geminiClient.ts';
import { normalizeDirectoryPhoneE164 } from './directoryPhone.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const LOG_SCOPE = 'directory-ai-analyze';
const MODEL_RESOLUTION = resolveDirectoryAnalysisModel();
const ANALYSIS_MODEL = MODEL_RESOLUTION.model;

const DEFAULT_MAX_ISSUES_PER_RUN = 5;
const MAX_ISSUES_PER_RUN = 10;
const MIN_ISSUES_PER_RUN = 1;
const MAX_SPLIT_DEPTH = 3;
const MAX_DUP_GROUPS_PER_PROMPT = 3;

const DUPLICATE_ISSUE_TYPES = ['duplicate_phone', 'duplicate_email', 'duplicate_name', 'duplicate_orphan'];

// Confianza mínima para proponer keep_separate (personas distintas) sin fusionar.
const KEEP_SEPARATE_MIN_CONFIDENCE = 0.6;

const FIELD_SUGGESTION = {
  type: 'object',
  nullable: true,
  properties: {
    value: { type: 'string' },
    contact_name: { type: 'string' },
    reason: { type: 'string' },
    confidence: { type: 'number' },
  },
};

const DIRECTORY_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entry_id: { type: 'string' },
          name_cleanup: FIELD_SUGGESTION,
          phone_fix: FIELD_SUGGESTION,
          tags: {
            type: 'object',
            nullable: true,
            properties: {
              values: { type: 'array', items: { type: 'string' } },
              reason: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
        required: ['entry_id'],
      },
    },
    duplicates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entry_ids: { type: 'array', items: { type: 'string' } },
          is_same_person: { type: 'boolean' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
          distinguishing_field: { type: 'string', nullable: true },
        },
        required: ['entry_ids', 'is_same_person'],
      },
    },
  },
  required: ['summary', 'suggestions', 'duplicates'],
};

interface DirectoryRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  phone_key: string | null;
  email: string | null;
  tags: string[] | null;
  source: string | null;
  classification: string | null;
  messages_count: number | null;
  provider_id: string | null;
  service_id: string | null;
  metadata: Record<string, unknown> | null;
}

/** Extrae el doc Firestore de origen (firebase_crmClient_docId) de metadata. */
function firebaseDocIdOf(row: DirectoryRow | undefined): string {
  const sourceIds = (row?.metadata as { source_ids?: Record<string, unknown> } | null)?.source_ids;
  const docId = sourceIds?.firebase_crmClient_docId;
  return typeof docId === 'string' ? docId : '';
}

interface WaConversationRow {
  id: string;
  contact_name: string | null;
  whatsapp_profile_name: string | null;
  phone_key: string | null;
}

interface IssueRow {
  id: string;
  entry_id: string | null;
  related_entry_ids: string[] | null;
  issue_type: string;
  details: Record<string, unknown> | null;
}

interface DupGroup {
  primary: string;
  ids: string[];
  issue: IssueRow;
}

interface GeminiSuggestion {
  entry_id?: string;
  name_cleanup?: { value?: string; contact_name?: string; reason?: string; confidence?: number } | null;
  phone_fix?: { value?: string; reason?: string; confidence?: number } | null;
  tags?: { values?: string[]; reason?: string; confidence?: number } | null;
}

interface GeminiDuplicate {
  entry_ids?: string[];
  is_same_person?: boolean;
  confidence?: number;
  reason?: string;
  distinguishing_field?: string;
}

interface GeminiResult {
  summary?: string;
  suggestions?: GeminiSuggestion[];
  duplicates?: GeminiDuplicate[];
}

function clampConfidence(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, Number(n.toFixed(3))));
}

function sortedIdsKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function computeEffectiveBatchSize(requested: number, dupGroupCount: number): number {
  const base = Math.min(requested, DEFAULT_MAX_ISSUES_PER_RUN);
  const penalty = Math.ceil(dupGroupCount / 2);
  return Math.max(MIN_ISSUES_PER_RUN, base - penalty);
}

function capDupGroupsForPrompt(groups: DupGroup[]): DupGroup[] {
  return groups.slice(0, MAX_DUP_GROUPS_PER_PROMPT);
}

function buildTagsPromptSection(allowedTags: string[]): string {
  if (allowedTags.length <= 40) {
    return `- tags: SOLO etiquetas de esta lista (no inventes): ${JSON.stringify(allowedTags)}. Si ninguna aplica, omite el campo.\n`;
  }
  return `- tags: hay ${allowedTags.length} etiquetas en el sistema; sugiere solo nombres ya presentes en tags del contacto o de la lista corta: ${JSON.stringify(allowedTags.slice(0, 40))}…\n`;
}

function logAnalysis(event: string, data?: Record<string, unknown>): void {
  geminiLog(LOG_SCOPE, event, data);
}

export interface DirectoryAnalysisResult {
  analyzed: number;
  created: number;
  remaining: number;
  model: string;
  modelConfigured?: string;
  modelOverridden?: boolean;
  summary: string;
  batchSizeUsed: number;
  retries: number;
  failedBatches?: number;
  finishReason?: string;
  lastError?: string;
  partialSuccess?: boolean;
  targeted?: boolean;
  entryIds?: string[];
}

/**
 * Ejecuta una pasada de análisis con Gemini sobre los issues abiertos del directorio.
 * Devuelve un objeto plano (sin Response) para que cada Edge Function lo envuelva.
 * Maneja internamente el caso MAX_TOKENS devolviendo un resultado parcial.
 */
export async function runDirectoryAnalysis(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<DirectoryAnalysisResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada.');
  }
  const geminiKey: string = apiKey;

  const requestedType = typeof body.issueType === 'string' ? body.issueType.trim() : '';
  const targetEntryIds = Array.isArray(body.entryIds)
    ? (body.entryIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
  const targetIssueIds = Array.isArray(body.issueIds)
    ? (body.issueIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
  // Modo dirigido por fila: regenera la sugerencia de las entradas/issues indicados.
  const targeted = targetEntryIds.length > 0 || targetIssueIds.length > 0;
  const reanalyze = !targeted && body.reanalyze === true;
  const requestedBatch = Number(body.batchSize ?? body.limit);
  const maxIssues = Math.max(
    MIN_ISSUES_PER_RUN,
    Math.min(
      Number.isFinite(requestedBatch) && requestedBatch > 0
        ? requestedBatch
        : DEFAULT_MAX_ISSUES_PER_RUN,
      MAX_ISSUES_PER_RUN,
    ),
  );

  let modelUsed = ANALYSIS_MODEL;
  let retries = 0;
  let batchSizeUsed = maxIssues;
  let lastFinishReason: string | undefined;

  logAnalysis('invoke_start', {
    modelUsed,
    modelConfigured: MODEL_RESOLUTION.configured,
    modelOverridden: MODEL_RESOLUTION.overridden,
    maxIssues,
    requestedType: requestedType || null,
    reanalyze,
    targeted,
    targetEntryIds: targetEntryIds.length,
    targetIssueIds: targetIssueIds.length,
  });

  if (MODEL_RESOLUTION.overridden) {
    logAnalysis('model_override', {
      configured: MODEL_RESOLUTION.configured,
      using: ANALYSIS_MODEL,
      reason: 'pro_or_unset_uses_flash_for_directory_batch',
    });
  }

  async function analyzeBatch(prompt: string, meta: Record<string, unknown>): Promise<GeminiResult> {
    try {
      const { data, finishReason } = await geminiGenerateJsonWithMeta<GeminiResult>({
        apiKey: geminiKey,
        model: modelUsed,
        prompt,
        temperature: 0,
        maxOutputTokens: 8192,
        responseSchema: DIRECTORY_ANALYSIS_SCHEMA,
        logScope: LOG_SCOPE,
      });
      lastFinishReason = finishReason;
      logAnalysis('gemini_ok', {
        ...meta,
        model: modelUsed,
        finishReason,
        suggestions: data.suggestions?.length ?? 0,
        duplicates: data.duplicates?.length ?? 0,
      });
      return data;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      logAnalysis('gemini_error', { ...meta, model: modelUsed, error: msg });
      const modelMissing = /\b404\b|not found|not_found|is not supported|no such model|unsupported/i.test(msg);
      if (modelMissing && modelUsed !== DEFAULT_GEMINI_MODEL) {
        modelUsed = DEFAULT_GEMINI_MODEL;
        logAnalysis('model_fallback', { fallback: modelUsed });
        const { data, finishReason } = await geminiGenerateJsonWithMeta<GeminiResult>({
          apiKey: geminiKey,
          model: modelUsed,
          prompt,
          temperature: 0,
          maxOutputTokens: 8192,
          responseSchema: DIRECTORY_ANALYSIS_SCHEMA,
          logScope: LOG_SCOPE,
        });
        lastFinishReason = finishReason;
        return data;
      }
      throw e;
    }
  }

  try {
    // reanalyze: limpia ai_analyzed_at de los issues abiertos para reprocesar toda la
    // tabla por lotes (analyzeAllWithAI envía reanalyze solo en la primera pasada).
    if (reanalyze) {
      let resetQuery = supabase
        .from('crm_directory_issues')
        .update({ ai_analyzed_at: null })
        .eq('status', 'open')
        .not('ai_analyzed_at', 'is', null);
      if (requestedType) resetQuery = resetQuery.eq('issue_type', requestedType);
      const { error: resetError } = await resetQuery;
      if (resetError) throw new Error(formatError(resetError));
    }

    let issueQuery = supabase
      .from('crm_directory_issues')
      .select('id, entry_id, related_entry_ids, issue_type, details')
      .eq('status', 'open');
    if (targeted) {
      // Dirigido: filtra por entradas/issues e ignora ai_analyzed_at para poder regenerar.
      if (targetIssueIds.length > 0) issueQuery = issueQuery.in('id', targetIssueIds);
      if (targetEntryIds.length > 0) issueQuery = issueQuery.in('entry_id', targetEntryIds);
    } else {
      issueQuery = issueQuery.is('ai_analyzed_at', null);
    }
    if (requestedType) issueQuery = issueQuery.eq('issue_type', requestedType);
    issueQuery = issueQuery.order('detected_at', { ascending: true }).limit(maxIssues);

    const { data: issuesData, error: issuesError } = await issueQuery;
    if (issuesError) throw new Error(formatError(issuesError));
    const issues = (issuesData ?? []) as IssueRow[];

    async function countRemaining(): Promise<number> {
      let q = supabase
        .from('crm_directory_issues')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .is('ai_analyzed_at', null);
      if (requestedType) q = q.eq('issue_type', requestedType);
      const { count } = await q;
      return count ?? 0;
    }

    if (issues.length === 0) {
      const remaining = await countRemaining();
      logAnalysis('no_issues', { remaining });
      return {
        analyzed: 0,
        created: 0,
        remaining,
        model: modelUsed,
        batchSizeUsed: 0,
        retries: 0,
        summary: reanalyze
          ? 'No hay inconsistencias abiertas para analizar.'
          : 'No quedan inconsistencias pendientes de análisis con IA.',
      };
    }

    const entryIdSet = new Set<string>();
    const issueByEntry = new Map<string, IssueRow[]>();
    const dupGroups: DupGroup[] = [];

    for (const issue of issues) {
      if (issue.entry_id) {
        entryIdSet.add(issue.entry_id);
        const list = issueByEntry.get(issue.entry_id) ?? [];
        list.push(issue);
        issueByEntry.set(issue.entry_id, list);
      }
      if (DUPLICATE_ISSUE_TYPES.includes(issue.issue_type)) {
        const detailIds = Array.isArray(issue.details?.entry_ids)
          ? (issue.details!.entry_ids as string[])
          : [];
        const ids = [...new Set([issue.entry_id, ...(issue.related_entry_ids ?? []), ...detailIds].filter(
          (x): x is string => typeof x === 'string',
        ))];
        ids.forEach((id) => entryIdSet.add(id));
        if (ids.length > 1) {
          dupGroups.push({ primary: issue.entry_id ?? ids[0], ids, issue });
        }
      }
    }

    const allEntryIds = [...entryIdSet];
    const entryById = new Map<string, DirectoryRow>();
    for (const idsChunk of chunk(allEntryIds, 300)) {
      const { data: dirData, error: dirError } = await supabase
        .from('crm_directory')
        .select('id, full_name, phone, phone_key, email, tags, source, classification, messages_count, provider_id, service_id, metadata')
        .in('id', idsChunk);
      if (dirError) throw new Error(formatError(dirError));
      for (const e of (dirData ?? []) as DirectoryRow[]) entryById.set(e.id, e);
    }

    const phoneKeys = [...new Set(
      [...entryById.values()]
        .map((e) => e.phone_key)
        .filter((k): k is string => typeof k === 'string' && k.trim() !== ''),
    )];
    const waByPhoneKey = new Map<string, WaConversationRow>();
    for (const keysChunk of chunk(phoneKeys, 200)) {
      const { data: waData, error: waError } = await supabase
        .from('whatsapp_conversations')
        .select('id, contact_name, whatsapp_profile_name, phone_key')
        .in('phone_key', keysChunk);
      if (waError) throw new Error(formatError(waError));
      for (const row of (waData ?? []) as WaConversationRow[]) {
        if (row.phone_key) waByPhoneKey.set(row.phone_key, row);
      }
    }

    const { data: tagsData, error: tagsError } = await supabase
      .from('whatsapp_chat_tags')
      .select('name')
      .eq('archived', false);
    if (tagsError) throw new Error(formatError(tagsError));
    const allowedTags = (tagsData ?? [])
      .map((t: { name: string }) => t.name)
      .filter((n: unknown): n is string => typeof n === 'string' && n.trim() !== '');
    const allowedTagByLower = new Map(allowedTags.map((t: string) => [t.toLowerCase(), t]));

    function buildPrompt(
      entriesChunk: DirectoryRow[],
      dupChunk: DupGroup[],
    ): string {
      const compactEntries = entriesChunk.map((e) => {
        const wa = e.phone_key ? waByPhoneKey.get(e.phone_key) : undefined;
        const issueTypes = (issueByEntry.get(e.id) ?? []).map((i) => i.issue_type);
        const payload: Record<string, unknown> = {
          id: e.id,
          full_name: e.full_name ?? '',
          phone: e.phone ?? '',
          email: e.email ?? '',
          tags: e.tags ?? [],
          issues: issueTypes,
        };
        if (issueTypes.includes('name_wa_mismatch') || wa) {
          payload.contact_name = wa?.contact_name ?? '';
          payload.whatsapp_profile_name = wa?.whatsapp_profile_name ?? '';
        }
        return payload;
      });
      const compactDupGroups = dupChunk.map((g) => ({
        entry_ids: g.ids,
        members: g.ids.map((id) => {
          const e = entryById.get(id);
          const wa = e?.phone_key ? waByPhoneKey.get(e.phone_key) : undefined;
          return {
            id,
            full_name: e?.full_name ?? '',
            phone: e?.phone ?? '',
            email: e?.email ?? '',
            source: e?.source ?? '',
            tags: e?.tags ?? [],
            classification: e?.classification ?? '',
            messages_count: e?.messages_count ?? 0,
            contact_name: wa?.contact_name ?? '',
            provider_id: e?.provider_id ?? '',
            service_id: e?.service_id ?? '',
            firebase_doc: firebaseDocIdOf(e),
          };
        }),
      }));

      return (
        'Eres un asistente experto en calidad de datos para un CRM de Prosavis (Colombia). ' +
        'Devuelve JSON con summary (máx. 300 caracteres), suggestions y duplicates.\n\n' +
        'Reglas:\n' +
        '- name_cleanup: produce un nombre humano legible para full_name. Corrige emojis, símbolos, ' +
        'capitalización y espacios (ej. "Pao Muñoz ♥️" → "Pao Muñoz", "🍄YENNY💝" → "Yenny"). ' +
        'Si full_name NO es usable (solo emojis/símbolos, una sola letra, o son dígitos/un teléfono), ' +
        'DERIVA el nombre desde, en orden: contact_name, whatsapp_profile_name (limpiándolos), o la ' +
        'parte local del email (ej. "mariahenao815@gmail.com" → "Maria Henao", "jhonny1987meneses@icloud.com" → "Jhonny Meneses"). ' +
        'Solo si NO existe ninguna fuente para un nombre real (sin email y con texto puramente simbólico), omite name_cleanup. ' +
        'Si hay name_wa_mismatch, propone full_name (CRM) y contact_name (WhatsApp) con el mismo valor legible.\n' +
        '- phone_fix: E.164 colombiano (+57…). NUNCA inventes números; si no hay teléfono en los datos, omite.\n' +
        buildTagsPromptSection(allowedTags) +
        '- duplicates: is_same_person=true si coinciden identificadores fuertes — mismo teléfono, ' +
        'mismo email, mismo firebase_doc, o mismo provider_id+service_id (aunque NO tengan teléfono ' +
        'ni email: misma persona del mismo servicio CRM). Si comparten solo el nombre y NINGÚN ' +
        'identificador (teléfono, email, firebase_doc ni provider_id+service_id), son personas ' +
        'DIFERENTES (is_same_person=false) y cita en distinguishing_field el dato diferenciador ' +
        '(ej. "telefonos distintos", "emails distintos", "sin identificador compartido"). reason máx. 120 caracteres.\n' +
        '- confidence: 0..1. No inventes datos que no estén presentes.\n\n' +
        'CONTACTOS:\n' + JSON.stringify(compactEntries) + '\n\n' +
        'GRUPOS_DUPLICADOS:\n' + JSON.stringify(compactDupGroups)
      );
    }

    let created = 0;

    async function upsert(params: {
      dedupeKey: string;
      entryId: string | null;
      issueId: string | null;
      type: string;
      field: string | null;
      current: unknown;
      suggested: unknown;
      confidence: number | null;
      reason: string;
      related: string[];
    }) {
      const { error } = await supabase.rpc('upsert_directory_ai_suggestion', {
        p_dedupe_key: params.dedupeKey,
        p_entry_id: params.entryId,
        p_issue_id: params.issueId,
        p_type: params.type,
        p_field: params.field,
        p_current: params.current ?? {},
        p_suggested: params.suggested ?? {},
        p_confidence: params.confidence,
        p_reason: params.reason || null,
        p_related: params.related,
        p_model: modelUsed,
      });
      if (error) throw new Error(formatError(error));
      created += 1;
    }

    async function processResult(result: GeminiResult, scopeDupGroups: DupGroup[]) {
      for (const s of result.suggestions ?? []) {
        const entry = s.entry_id ? entryById.get(s.entry_id) : undefined;
        if (!entry) continue;
        const primaryIssue = (issueByEntry.get(entry.id) ?? [])[0];
        const wa = entry.phone_key ? waByPhoneKey.get(entry.phone_key) : undefined;

        const nameVal = s.name_cleanup?.value?.trim();
        if (nameVal && nameVal.toLowerCase() !== (entry.full_name ?? '').trim().toLowerCase()) {
          const contactName = s.name_cleanup?.contact_name?.trim() || nameVal;
          await upsert({
            dedupeKey: `name_cleanup:${entry.id}`,
            entryId: entry.id,
            issueId: primaryIssue?.id ?? null,
            type: 'name_cleanup',
            field: 'full_name',
            current: {
              value: entry.full_name ?? '',
              contact_name: wa?.contact_name ?? '',
              whatsapp_profile_name: wa?.whatsapp_profile_name ?? '',
            },
            suggested: { value: nameVal, contact_name: contactName },
            confidence: clampConfidence(s.name_cleanup?.confidence),
            reason: s.name_cleanup?.reason ?? '',
            related: [],
          });
        } else if (nameVal && wa && primaryIssue?.issue_type === 'name_wa_mismatch') {
          const currentCn = (wa.contact_name ?? '').trim();
          const suggestedCn = s.name_cleanup?.contact_name?.trim() || nameVal;
          if (suggestedCn && suggestedCn !== currentCn) {
            await upsert({
              dedupeKey: `name_cleanup:${entry.id}`,
              entryId: entry.id,
              issueId: primaryIssue?.id ?? null,
              type: 'name_cleanup',
              field: 'full_name',
              current: {
                value: entry.full_name ?? '',
                contact_name: currentCn,
                whatsapp_profile_name: wa.whatsapp_profile_name ?? '',
              },
              suggested: { value: entry.full_name ?? nameVal, contact_name: suggestedCn },
              confidence: clampConfidence(s.name_cleanup?.confidence),
              reason: s.name_cleanup?.reason ?? 'Sincronizar contact_name con nombre CRM',
              related: [],
            });
          }
        }

        const rawPhone = s.phone_fix?.value?.trim();
        if (rawPhone) {
          const normalized = normalizeDirectoryPhoneE164(rawPhone);
          if (normalized && normalized !== (entry.phone ?? '').trim()) {
            await upsert({
              dedupeKey: `phone_fix:${entry.id}`,
              entryId: entry.id,
              issueId: primaryIssue?.id ?? null,
              type: 'phone_fix',
              field: 'phone',
              current: { value: entry.phone ?? '' },
              suggested: { value: normalized },
              confidence: clampConfidence(s.phone_fix?.confidence),
              reason: s.phone_fix?.reason ?? '',
              related: [],
            });
          }
        }

        const rawTags = Array.isArray(s.tags?.values) ? s.tags!.values! : [];
        const existingLower = new Set((entry.tags ?? []).map((t) => t.toLowerCase()));
        const canonical = [
          ...new Set(
            rawTags
              .map((t) => (typeof t === 'string' ? allowedTagByLower.get(t.trim().toLowerCase()) : undefined))
              .filter((t): t is string => !!t && !existingLower.has(t.toLowerCase())),
          ),
        ];
        if (canonical.length > 0) {
          await upsert({
            dedupeKey: `tag_suggestion:${entry.id}`,
            entryId: entry.id,
            issueId: primaryIssue?.id ?? null,
            type: 'tag_suggestion',
            field: 'tags',
            current: { value: entry.tags ?? [] },
            suggested: { value: canonical },
            confidence: clampConfidence(s.tags?.confidence),
            reason: s.tags?.reason ?? '',
            related: [],
          });
        }
      }

      for (const d of result.duplicates ?? []) {
        const ids = (d.entry_ids ?? []).filter((id): id is string => typeof id === 'string' && entryById.has(id));
        if (ids.length < 2) continue;
        const group = scopeDupGroups.find((g) => sortedIdsKey(g.ids) === sortedIdsKey(ids))
          ?? scopeDupGroups.find((g) => ids.every((id) => g.ids.includes(id)));
        const primary = group?.primary ?? ids[0];
        const related = ids.filter((id) => id !== primary);

        if (d.is_same_person) {
          await upsert({
            dedupeKey: `merge:${sortedIdsKey(ids)}`,
            entryId: primary,
            issueId: group?.issue.id ?? null,
            type: 'merge',
            field: null,
            current: {},
            suggested: { primary, related },
            confidence: clampConfidence(d.confidence),
            reason: d.reason ?? '',
            related,
          });
          continue;
        }

        // Personas distintas con suficiente confianza: proponer dejarlas independientes.
        const conf = clampConfidence(d.confidence);
        if (conf != null && conf >= KEEP_SEPARATE_MIN_CONFIDENCE) {
          await upsert({
            dedupeKey: `keep_separate:${sortedIdsKey(ids)}`,
            entryId: primary,
            issueId: group?.issue.id ?? null,
            type: 'keep_separate',
            field: null,
            current: {},
            suggested: { entry_ids: ids, distinguishing_field: d.distinguishing_field ?? '' },
            confidence: conf,
            reason: d.reason ?? '',
            related,
          });
        }
      }
    }

    function dupGroupsForIssues(issueSubset: IssueRow[]): DupGroup[] {
      const ids = new Set(issueSubset.map((i) => i.id));
      return dupGroups.filter((g) => ids.has(g.issue.id));
    }

    function entriesForIssues(issueSubset: IssueRow[]): DirectoryRow[] {
      const entryIds = new Set<string>();
      for (const issue of issueSubset) {
        if (issue.entry_id) entryIds.add(issue.entry_id);
      }
      return [...entryIds]
        .map((id) => entryById.get(id))
        .filter((e): e is DirectoryRow => !!e);
    }

    async function processIssueSubset(
      issueSubset: IssueRow[],
      depth = 0,
    ): Promise<string[]> {
      if (issueSubset.length === 0) return [];

      const subsetDupGroups = capDupGroupsForPrompt(dupGroupsForIssues(issueSubset));
      const entriesChunk = entriesForIssues(issueSubset);
      const prompt = buildPrompt(entriesChunk, subsetDupGroups);
      const meta = {
        depth,
        issues: issueSubset.length,
        entries: entriesChunk.length,
        dupGroups: subsetDupGroups.length,
        promptChars: prompt.length,
      };

      try {
        logAnalysis('subset_start', meta);
        const result = await analyzeBatch(prompt, meta);
        await processResult(result, subsetDupGroups);
        logAnalysis('subset_done', { ...meta, stamped: issueSubset.length });
        return issueSubset.map((i) => i.id);
      } catch (e) {
        if (isGeminiMaxTokensError(e) && issueSubset.length > 1 && depth < MAX_SPLIT_DEPTH) {
          retries += 1;
          const mid = Math.ceil(issueSubset.length / 2);
          logAnalysis('subset_split', { ...meta, retries, left: mid, right: issueSubset.length - mid });
          const left = await processIssueSubset(issueSubset.slice(0, mid), depth + 1);
          const right = await processIssueSubset(issueSubset.slice(mid), depth + 1);
          return [...left, ...right];
        }
        logAnalysis('subset_failed', {
          ...meta,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    }

    batchSizeUsed = computeEffectiveBatchSize(maxIssues, dupGroups.length);
    const issueChunks = chunk(issues, batchSizeUsed);
    logAnalysis('batch_plan', {
      issuesLoaded: issues.length,
      dupGroupsTotal: dupGroups.length,
      batchSizeUsed,
      chunkCount: issueChunks.length,
    });
    const stampedIssueIds: string[] = [];
    let failedBatches = 0;
    let lastBatchError: string | undefined;

    for (const issueChunk of issueChunks) {
      try {
        const ids = await processIssueSubset(issueChunk);
        stampedIssueIds.push(...ids);
      } catch (e) {
        failedBatches += 1;
        lastBatchError = e instanceof Error ? e.message : String(e);
        logAnalysis('chunk_failed', {
          chunkIssues: issueChunk.length,
          failedBatches,
          error: lastBatchError,
        });
      }
    }

    const uniqueStamped = [...new Set(stampedIssueIds)];
    if (uniqueStamped.length > 0) {
      const stampedAt = new Date().toISOString();
      for (const idsChunk of chunk(uniqueStamped, 200)) {
        const { error: stampError } = await supabase
          .from('crm_directory_issues')
          .update({ ai_analyzed_at: stampedAt })
          .in('id', idsChunk);
        if (stampError) throw new Error(formatError(stampError));
      }
    }

    const remaining = await countRemaining();
    const entriesAnalyzed = new Set(
      uniqueStamped.flatMap((id) => {
        const issue = issues.find((i) => i.id === id);
        return issue?.entry_id ? [issue.entry_id] : [];
      }),
    ).size;

    const summary =
      `Última pasada de IA (${modelUsed}): ${entriesAnalyzed} contacto(s) y ` +
      `${dupGroups.length} grupo(s) de duplicados revisados, ${created} sugerencia(s) nueva(s).` +
      (failedBatches > 0 ? ` ${failedBatches} lote(s) fallaron (reintentar pendientes).` : '') +
      (remaining > 0
        ? ` Pendientes por analizar: ${remaining}.`
        : ' Toda la tabla quedó analizada.');

    // En modo dirigido no recalculamos el resumen global: preserva el del análisis completo.
    if (!targeted) {
      await supabase.rpc('upsert_directory_ai_suggestion', {
        p_dedupe_key: 'summary:global',
        p_entry_id: null,
        p_issue_id: null,
        p_type: 'summary',
        p_field: null,
        p_current: {},
        p_suggested: { text: summary },
        p_confidence: null,
        p_reason: null,
        p_related: [],
        p_model: modelUsed,
      });
    }

    logAnalysis('invoke_done', {
      analyzed: uniqueStamped.length,
      created,
      remaining,
      failedBatches,
      retries,
      finishReason: lastFinishReason,
    });

    const processedEntryIds = [...new Set(
      uniqueStamped.flatMap((id) => {
        const issue = issues.find((i) => i.id === id);
        return issue?.entry_id ? [issue.entry_id] : [];
      }),
    )];

    return {
      analyzed: uniqueStamped.length,
      created,
      remaining,
      model: modelUsed,
      modelConfigured: MODEL_RESOLUTION.configured,
      modelOverridden: MODEL_RESOLUTION.overridden,
      summary,
      batchSizeUsed,
      retries,
      failedBatches,
      finishReason: lastFinishReason,
      lastError: lastBatchError,
      partialSuccess: failedBatches > 0,
      targeted,
      entryIds: processedEntryIds,
    };
  } catch (error) {
    const message = formatError(error);
    logAnalysis('invoke_fatal', { error: message });
    if (isGeminiMaxTokensError(error) || message.includes('MAX_TOKENS')) {
      return {
        analyzed: 0,
        created: 0,
        remaining: -1,
        model: ANALYSIS_MODEL,
        modelConfigured: MODEL_RESOLUTION.configured,
        modelOverridden: MODEL_RESOLUTION.overridden,
        summary: 'Lote demasiado grande para Gemini; reintenta (lotes más pequeños).',
        batchSizeUsed,
        retries,
        failedBatches: 1,
        lastError: message,
        partialSuccess: true,
      };
    }
    throw error;
  }
}

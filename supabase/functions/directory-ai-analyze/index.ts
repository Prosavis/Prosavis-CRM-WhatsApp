// directory-ai-analyze: usa Gemini para PROPONER (no aplicar) arreglos de calidad
// sobre crm_directory, a partir de los issues abiertos del orquestador.
//
// Reglas estrictas:
//  - NUNCA escribe en crm_directory. Solo inserta filas en crm_directory_ai_suggestions
//    (revisión humana). El humano aplica desde la UI vía upsert/merge existentes.
//  - Las sugerencias de etiquetas se restringen EXCLUSIVAMENTE a los tags ya existentes
//    en whatsapp_chat_tags (se filtran en el servidor; no se inventan tags nuevos).
//  - Los teléfonos sugeridos se validan/normalizan a E.164 con la utilidad compartida.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { getGeminiApiKey, geminiGenerateJson, DEFAULT_GEMINI_MODEL } from '../_shared/geminiClient.ts';
import { normalizeDirectoryPhoneE164 } from '../_shared/directoryPhone.ts';

const MAX_ENTRIES = 50;
const MAX_DUP_GROUPS = 25;
const DUPLICATE_ISSUE_TYPES = ['duplicate_phone', 'duplicate_email', 'duplicate_name'];

interface DirectoryRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  phone_key: string | null;
  email: string | null;
  tags: string[] | null;
  source: string | null;
}

interface IssueRow {
  id: string;
  entry_id: string | null;
  related_entry_ids: string[] | null;
  issue_type: string;
  details: Record<string, unknown> | null;
}

interface GeminiSuggestion {
  entry_id?: string;
  name_cleanup?: { value?: string; reason?: string; confidence?: number } | null;
  phone_fix?: { value?: string; reason?: string; confidence?: number } | null;
  tags?: { values?: string[]; reason?: string; confidence?: number } | null;
}

interface GeminiDuplicate {
  entry_ids?: string[];
  is_same_person?: boolean;
  confidence?: number;
  reason?: string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const apiKey = getGeminiApiKey();
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY no configurada.' }, 412);

    const requestedType = typeof body.issueType === 'string' ? body.issueType.trim() : '';
    const explicitIds: string[] = Array.isArray(body.entryIds)
      ? body.entryIds.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    const limit = Math.min(Number(body.limit) || MAX_ENTRIES, MAX_ENTRIES);

    // ── 1. Issues abiertos (fuente de candidatos) ────────────────────────────
    let issueQuery = supabase
      .from('crm_directory_issues')
      .select('id, entry_id, related_entry_ids, issue_type, details')
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(300);
    if (requestedType) issueQuery = issueQuery.eq('issue_type', requestedType);

    const { data: issuesData, error: issuesError } = await issueQuery;
    if (issuesError) throw issuesError;
    const issues = (issuesData ?? []) as IssueRow[];

    // ── 2. Resolver el conjunto de entradas a analizar ───────────────────────
    const entryIdSet = new Set<string>(explicitIds);
    const issueByEntry = new Map<string, IssueRow[]>();
    const dupGroups: { primary: string; ids: string[]; issue: IssueRow }[] = [];

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
        if (ids.length > 1 && dupGroups.length < MAX_DUP_GROUPS) {
          dupGroups.push({ primary: issue.entry_id ?? ids[0], ids, issue });
        }
      }
    }

    const entryIds = [...entryIdSet].slice(0, limit);
    if (entryIds.length === 0) {
      return jsonResponse({ analyzed: 0, created: 0, summary: 'No hay inconsistencias abiertas para analizar.' });
    }

    // ── 3. Cargar entradas + tags existentes (whitelist de etiquetas) ────────
    const { data: dirData, error: dirError } = await supabase
      .from('crm_directory')
      .select('id, full_name, phone, phone_key, email, tags, source')
      .in('id', entryIds);
    if (dirError) throw dirError;
    const entries = (dirData ?? []) as DirectoryRow[];
    const entryById = new Map(entries.map((e) => [e.id, e]));

    const { data: tagsData, error: tagsError } = await supabase
      .from('whatsapp_chat_tags')
      .select('name')
      .eq('archived', false);
    if (tagsError) throw tagsError;
    const allowedTags = (tagsData ?? [])
      .map((t: { name: string }) => t.name)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
    const allowedTagByLower = new Map(allowedTags.map((t) => [t.toLowerCase(), t]));

    // ── 4. Prompt para Gemini (salida JSON estricta) ─────────────────────────
    const compactEntries = entries.map((e) => ({
      id: e.id,
      full_name: e.full_name ?? '',
      phone: e.phone ?? '',
      email: e.email ?? '',
      tags: e.tags ?? [],
      issues: (issueByEntry.get(e.id) ?? []).map((i) => i.issue_type),
    }));
    const compactDupGroups = dupGroups.map((g) => ({
      entry_ids: g.ids,
      members: g.ids.map((id) => {
        const e = entryById.get(id);
        return { id, full_name: e?.full_name ?? '', phone: e?.phone ?? '', email: e?.email ?? '' };
      }),
    }));

    const prompt =
      'Eres un asistente de calidad de datos para un CRM de Prosavis (Colombia). ' +
      'Analiza contactos del directorio y devuelve EXCLUSIVAMENTE JSON válido con esta forma:\n' +
      '{"summary": string, "suggestions": [{"entry_id": string, ' +
      '"name_cleanup": {"value": string, "reason": string, "confidence": number}|null, ' +
      '"phone_fix": {"value": string, "reason": string, "confidence": number}|null, ' +
      '"tags": {"values": string[], "reason": string, "confidence": number}|null}], ' +
      '"duplicates": [{"entry_ids": string[], "is_same_person": boolean, "confidence": number, "reason": string}]}\n\n' +
      'Reglas:\n' +
      '- name_cleanup: si el nombre tiene emojis, mayúsculas raras, espacios sobrantes, o es basura, propone una versión limpia y legible en español. Si está bien, usa null. NUNCA inventes un nombre cuando no haya información (deja null).\n' +
      '- phone_fix: si el teléfono tiene formato inválido pero se puede inferir, propone el número en formato E.164 colombiano (+57XXXXXXXXXX). Si no se puede inferir con seguridad, usa null.\n' +
      '- tags: SOLO puedes sugerir etiquetas de esta lista exacta (no inventes ninguna): ' +
      JSON.stringify(allowedTags) + '. Si ninguna aplica, usa null.\n' +
      '- duplicates: para cada grupo, decide si realmente son la MISMA persona (mismo nombre+teléfono/email coherentes). Si dudas, is_same_person=false.\n' +
      '- confidence es un número entre 0 y 1. summary es un resumen breve en español de los hallazgos.\n\n' +
      'CONTACTOS:\n' + JSON.stringify(compactEntries) + '\n\n' +
      'GRUPOS_DUPLICADOS:\n' + JSON.stringify(compactDupGroups);

    const result = await geminiGenerateJson<GeminiResult>({ apiKey, prompt, temperature: 0 });

    // ── 5. Validar y mapear a sugerencias (filtrado server-side) ─────────────
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
        p_model: DEFAULT_GEMINI_MODEL,
      });
      if (error) throw error;
      created += 1;
    }

    for (const s of result.suggestions ?? []) {
      const entry = s.entry_id ? entryById.get(s.entry_id) : undefined;
      if (!entry) continue;
      const primaryIssue = (issueByEntry.get(entry.id) ?? [])[0];

      // Nombre
      const nameVal = s.name_cleanup?.value?.trim();
      if (nameVal && nameVal.toLowerCase() !== (entry.full_name ?? '').trim().toLowerCase()) {
        await upsert({
          dedupeKey: `name_cleanup:${entry.id}`,
          entryId: entry.id,
          issueId: primaryIssue?.id ?? null,
          type: 'name_cleanup',
          field: 'full_name',
          current: { value: entry.full_name ?? '' },
          suggested: { value: nameVal },
          confidence: clampConfidence(s.name_cleanup?.confidence),
          reason: s.name_cleanup?.reason ?? '',
          related: [],
        });
      }

      // Teléfono
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

      // Etiquetas (whitelist estricta + excluir las que ya tiene)
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

    // Fusiones sugeridas
    for (const d of result.duplicates ?? []) {
      const ids = (d.entry_ids ?? []).filter((id): id is string => typeof id === 'string' && entryById.has(id));
      if (!d.is_same_person || ids.length < 2) continue;
      const group = dupGroups.find((g) => sortedIdsKey(g.ids) === sortedIdsKey(ids))
        ?? dupGroups.find((g) => ids.every((id) => g.ids.includes(id)));
      const primary = group?.primary ?? ids[0];
      const related = ids.filter((id) => id !== primary);
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
    }

    // Resumen global (notificación legible)
    const summary = (result.summary ?? '').trim();
    if (summary) {
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
        p_model: DEFAULT_GEMINI_MODEL,
      });
    }

    return jsonResponse({ analyzed: entries.length, created, summary });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return jsonResponse({ error: message }, 500);
  }
});

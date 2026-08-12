// deno-lint-ignore-file no-explicit-any
/** Cliente Supabase tipado de forma laxa para poder testear helpers puros con Vitest. */
type SupabaseClient = any;

export interface ConversationTurn {
  role: 'user' | 'bot';
  text: string;
  createdAt?: string;
}

export interface ConversationHistoryMeta {
  loaded: number;
  truncated: boolean;
  newestAt?: string;
  oldestAt?: string;
}

export interface ConversationHistoryResult {
  turns: ConversationTurn[];
  meta: ConversationHistoryMeta;
}

/** Ventana reciente por defecto (mensajes más nuevos primero en el fetch). */
export const DEFAULT_HISTORY_LIMIT = 150;
/** Tope de caracteres del transcript tras merge (se recorta desde lo más antiguo). */
export const DEFAULT_TRANSCRIPT_CHAR_BUDGET = 60_000;
export const AUDIO_TRANSCRIPT_PREFIX = '[Audio transcrito]:';

function asTrimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMediaPlaceholder(text: string, mediaType: string | null): boolean {
  if (!mediaType) return false;
  return text.toLowerCase() === `[${mediaType.toLowerCase()}]`;
}

/**
 * Texto que entra al historial de IA. Si hay transcripción de audio y el
 * toggle está activo, sustituye el placeholder `[audio]` del webhook.
 */
export function resolveConversationTurnText(
  row: {
    message_body?: unknown;
    caption?: unknown;
    media_type?: unknown;
    voice_transcription?: unknown;
  },
  includeVoiceTranscriptions = false,
): string {
  const mediaType = asTrimmedText(row.media_type) || null;
  const body = asTrimmedText(row.message_body);
  const caption = asTrimmedText(row.caption);
  const transcription = includeVoiceTranscriptions
    ? asTrimmedText(row.voice_transcription)
    : '';

  if (transcription && (mediaType === 'audio' || isMediaPlaceholder(body, mediaType))) {
    const labeled = `${AUDIO_TRANSCRIPT_PREFIX} ${transcription}`;
    if (caption && caption !== transcription && !isMediaPlaceholder(caption, mediaType)) {
      return `${caption}\n${labeled}`;
    }
    return labeled;
  }

  const text = body || caption;
  if (text) return text;
  if (mediaType) return `[${mediaType}]`;
  return '';
}

export async function getConversationHistory(
  supabase: SupabaseClient,
  stableKey: string,
  limit = DEFAULT_HISTORY_LIMIT,
  options?: { includeVoiceTranscriptions?: boolean },
): Promise<ConversationTurn[]> {
  const result = await getConversationHistoryWithMeta(supabase, stableKey, limit, options);
  return result.turns;
}

/**
 * Carga los N mensajes más recientes (created_at DESC + reverse),
 * no los N más antiguos (bug previo con ASC + limit).
 */
export async function getConversationHistoryWithMeta(
  supabase: SupabaseClient,
  stableKey: string,
  limit = DEFAULT_HISTORY_LIMIT,
  options?: { includeVoiceTranscriptions?: boolean },
): Promise<ConversationHistoryResult> {
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select(
      'direction,message_body,caption,media_type,voice_transcription,hidden_from_panel,created_at',
    )
    .eq('conversation_stable_key', stableKey)
    .eq('hidden_from_panel', false)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (error) throw error;

  const fetchedRows = data ?? [];
  const sourceTruncated = fetchedRows.length > limit;
  const rowsNewestFirst = fetchedRows.slice(0, limit);
  const rowsChronological = [...rowsNewestFirst].reverse();

  const turns: ConversationTurn[] = [];
  for (const row of rowsChronological) {
    const text = resolveConversationTurnText(
      row,
      options?.includeVoiceTranscriptions === true,
    );
    if (!text) continue;
    turns.push({
      role: row.direction === 'inbound' ? 'user' : 'bot',
      text,
      createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    });
  }

  const withTimestamps = turns.filter((t) => t.createdAt);
  const oldestAt = withTimestamps[0]?.createdAt;
  const newestAt = withTimestamps[withTimestamps.length - 1]?.createdAt;

  return {
    turns,
    meta: {
      loaded: turns.length,
      truncated: sourceTruncated,
      ...(oldestAt ? { oldestAt } : {}),
      ...(newestAt ? { newestAt } : {}),
    },
  };
}

export function buildMergedTurns(turns: ConversationTurn[]): ConversationTurn[] {
  const firstUserIdx = turns.findIndex((t) => t.role === 'user' && t.text.trim());
  if (firstUserIdx === -1) return [];
  const sliced = turns.slice(firstUserIdx).filter((t) => t.text.trim());
  const merged: ConversationTurn[] = [];
  for (const t of sliced) {
    const text = t.text.trim();
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) {
      last.text = `${last.text}\n${text}`;
      if (t.createdAt && Number.isFinite(new Date(t.createdAt).getTime())) {
        last.createdAt = t.createdAt;
      }
    } else {
      const createdAt =
        t.createdAt && Number.isFinite(new Date(t.createdAt).getTime())
          ? t.createdAt
          : null;
      merged.push({
        role: t.role,
        text,
        ...(createdAt ? { createdAt } : {}),
      });
    }
  }
  return merged;
}

/** Formatea createdAt ISO a etiqueta corta en America/Bogota. */
export function formatTurnTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

export function mergedTurnsToTranscript(merged: ConversationTurn[]): string {
  return merged
    .map((t) => {
      const who = t.role === 'user' ? 'Cliente' : 'Agente';
      const stamp = t.createdAt ? `[${formatTurnTimestamp(t.createdAt)}] ` : '';
      return `${stamp}${who}: ${t.text}`;
    })
    .join('\n');
}

/**
 * Recorta turns desde lo más antiguo hasta caber en maxChars del transcript.
 * Devuelve turns restantes + meta de truncado.
 */
export function applyTranscriptCharBudget(
  merged: ConversationTurn[],
  maxChars = DEFAULT_TRANSCRIPT_CHAR_BUDGET,
): { turns: ConversationTurn[]; truncated: boolean; transcript: string } {
  if (merged.length === 0) {
    return { turns: [], truncated: false, transcript: '' };
  }

  let transcript = mergedTurnsToTranscript(merged);
  if (transcript.length <= maxChars) {
    return { turns: merged, truncated: false, transcript };
  }

  let start = 0;
  let truncated = false;
  while (start < merged.length - 1) {
    start += 1;
    truncated = true;
    transcript = mergedTurnsToTranscript(merged.slice(start));
    if (transcript.length <= maxChars) break;
  }

  // Si un solo turn supera el presupuesto, cortar el texto del turn.
  if (transcript.length > maxChars) {
    const last = merged[merged.length - 1];
    const stamp = last.createdAt ? `[${formatTurnTimestamp(last.createdAt)}] ` : '';
    const prefix = `${stamp}${last.role === 'user' ? 'Cliente' : 'Agente'}: `;
    const bodyBudget = Math.max(0, maxChars - prefix.length - 1);
    const clipped: ConversationTurn = {
      ...last,
      text: `${last.text.slice(-bodyBudget)}…`,
    };
    transcript = mergedTurnsToTranscript([clipped]);
    return { turns: [clipped], truncated: true, transcript };
  }

  return { turns: merged.slice(start), truncated, transcript };
}

/** Pipeline completo: merge + presupuesto de caracteres + meta. */
export function buildTranscriptWithBudget(
  historyTurns: ConversationTurn[],
  historyMeta: ConversationHistoryMeta,
  maxChars = DEFAULT_TRANSCRIPT_CHAR_BUDGET,
): {
  transcript: string;
  meta: ConversationHistoryMeta;
  merged: ConversationTurn[];
  completeMerged: ConversationTurn[];
} {
  const completeMerged = buildMergedTurns(historyTurns);
  const budgeted = applyTranscriptCharBudget(completeMerged, maxChars);
  return {
    transcript: budgeted.transcript,
    merged: budgeted.turns,
    completeMerged,
    meta: {
      ...historyMeta,
      loaded: budgeted.turns.length,
      truncated: historyMeta.truncated || budgeted.truncated,
      oldestAt: budgeted.turns[0]?.createdAt ?? historyMeta.oldestAt,
      newestAt:
        budgeted.turns[budgeted.turns.length - 1]?.createdAt ?? historyMeta.newestAt,
    },
  };
}

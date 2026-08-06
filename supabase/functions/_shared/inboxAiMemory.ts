// deno-lint-ignore-file no-explicit-any
import {
  DEFAULT_GEMINI_MODEL,
  geminiGenerateJson,
  getGeminiApiKey,
  resolveGeminiModel,
} from './geminiClient.ts';
import type { ConversationHistoryMeta } from './conversationHistory.ts';

type SupabaseClient = any;

export const INBOX_AI_MEMORY_REFRESH_MESSAGE_THRESHOLD = 20;
const MEMORY_TABLE = 'whatsapp_conversation_ai_memory';
const MESSAGE_LOG_TABLE = 'whatsapp_message_log';
const MEMORY_SELECT =
  'stable_key, summary, preferences, objections, agreements, ' +
  'last_summarized_message_at, message_count, model, updated_at';

export const INBOX_AI_MEMORY_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    preferences: {
      type: 'array',
      items: { type: 'string' },
    },
    objections: {
      type: 'array',
      items: { type: 'string' },
    },
    agreements: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'preferences', 'objections', 'agreements'],
});

export interface InboxAiMemory {
  stableKey: string;
  summary: string;
  preferences: string[];
  objections: string[];
  agreements: string[];
  lastSummarizedMessageAt: string | null;
  messageCount: number;
  model: string | null;
  updatedAt: string;
}

export interface InboxAiMemoryJson {
  summary: string;
  preferences: string[];
  objections: string[];
  agreements: string[];
}

export interface InboxAiMemoryGenerationParams {
  apiKey: string;
  model: string;
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
  responseJsonSchema: Record<string, unknown>;
  logScope: string;
  logResponsePreview: boolean;
}

export interface InboxAiMemoryDependencies {
  getApiKey: () => string | null;
  resolveModel: () => string;
  generateJson: (params: InboxAiMemoryGenerationParams) => Promise<unknown>;
  now: () => string;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    const dedupeKey = trimmed.toLocaleLowerCase('es');
    if (!trimmed || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(trimmed);
  }
  return normalized;
}

export function normalizeInboxAiMemoryJson(value: unknown): InboxAiMemoryJson {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  return {
    summary: typeof record.summary === 'string' ? record.summary.trim() : '',
    preferences: normalizeStringArray(record.preferences),
    objections: normalizeStringArray(record.objections),
    agreements: normalizeStringArray(record.agreements),
  };
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function mapInboxAiMemoryRow(value: unknown): InboxAiMemory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const stableKey = asString(row.stable_key);
  if (!stableKey) return null;
  const normalized = normalizeInboxAiMemoryJson(row);
  const rawMessageCount =
    typeof row.message_count === 'number' && Number.isInteger(row.message_count)
      ? row.message_count
      : 0;
  return {
    stableKey,
    ...normalized,
    lastSummarizedMessageAt: asString(row.last_summarized_message_at),
    messageCount: Math.max(0, rawMessageCount),
    model: asString(row.model),
    updatedAt: asString(row.updated_at) ?? '',
  };
}

export function shouldRefreshInboxAiMemory(params: {
  hasMemory: boolean;
  newVisibleMessageCount: number;
  historyTruncated: boolean;
}): boolean {
  return (
    (params.historyTruncated && params.newVisibleMessageCount > 0) ||
    params.newVisibleMessageCount >= INBOX_AI_MEMORY_REFRESH_MESSAGE_THRESHOLD
  );
}

function warnMemory(event: string, error?: unknown): void {
  const errorType =
    error instanceof Error && error.name
      ? error.name
      : error == null
        ? undefined
        : 'UnknownError';
  console.warn(JSON.stringify({
    scope: 'inbox-ai-memory',
    event,
    ...(errorType ? { errorType } : {}),
  }));
}

async function countVisibleMessages(
  supabase: SupabaseClient,
  stableKey: string,
  after?: string | null,
): Promise<number> {
  let query = supabase
    .from(MESSAGE_LOG_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('conversation_stable_key', stableKey)
    .eq('hidden_from_panel', false);
  if (after) {
    query = query.gt('created_at', after);
  }
  const { count, error } = await query;
  if (error) throw error;
  if (typeof count !== 'number' || count < 0) {
    throw new Error('Exact visible message count was unavailable');
  }
  return count;
}

function buildMemoryPrompt(
  previous: InboxAiMemory | null,
  transcript: string,
): string {
  const previousJson = previous
    ? JSON.stringify({
      summary: previous.summary,
      preferences: previous.preferences,
      objections: previous.objections,
      agreements: previous.agreements,
    })
    : 'Sin memoria anterior.';
  return [
    'Actualiza una memoria compacta de esta conversación de WhatsApp.',
    'Conserva únicamente hechos observables en el texto, acuerdos, preferencias y objeciones vigentes.',
    'No inventes, no completes datos ausentes y elimina información obsoleta o contradicha.',
    'Devuelve solo el JSON solicitado por el esquema.',
    '',
    'Memoria anterior:',
    previousJson,
    '',
    'Transcript cronológico disponible:',
    transcript,
  ].join('\n');
}

function defaultDependencies(): InboxAiMemoryDependencies {
  return {
    getApiKey: getGeminiApiKey,
    resolveModel: () =>
      resolveGeminiModel('GEMINI_MODEL_INBOX_MEMORY', DEFAULT_GEMINI_MODEL),
    generateJson: (params) => geminiGenerateJson<unknown>(params),
    now: () => new Date().toISOString(),
  };
}

export async function loadOrRefreshInboxAiMemory(params: {
  supabase: SupabaseClient;
  stableKey: string;
  transcript: string;
  historyMeta: ConversationHistoryMeta;
  dependencies?: Partial<InboxAiMemoryDependencies>;
}): Promise<InboxAiMemory | null> {
  const dependencies = {
    ...defaultDependencies(),
    ...params.dependencies,
  };

  let previous: InboxAiMemory | null;
  try {
    const { data, error } = await params.supabase
      .from(MEMORY_TABLE)
      .select(MEMORY_SELECT)
      .eq('stable_key', params.stableKey)
      .maybeSingle();
    if (error) throw error;
    previous = mapInboxAiMemoryRow(data);
  } catch (error) {
    warnMemory('memory-read-failed', error);
    return null;
  }

  let totalVisibleMessageCount: number | null = null;
  let newVisibleMessageCount: number;
  try {
    if (previous?.lastSummarizedMessageAt) {
      newVisibleMessageCount = await countVisibleMessages(
        params.supabase,
        params.stableKey,
        previous.lastSummarizedMessageAt,
      );
    } else {
      totalVisibleMessageCount = await countVisibleMessages(
        params.supabase,
        params.stableKey,
      );
      newVisibleMessageCount = totalVisibleMessageCount;
    }
  } catch (error) {
    warnMemory('message-count-failed', error);
    return previous;
  }

  if (!shouldRefreshInboxAiMemory({
    hasMemory: previous != null,
    newVisibleMessageCount,
    historyTruncated: params.historyMeta.truncated,
  })) {
    return previous;
  }

  if (totalVisibleMessageCount == null) {
    try {
      totalVisibleMessageCount = await countVisibleMessages(
        params.supabase,
        params.stableKey,
      );
    } catch (error) {
      warnMemory('message-count-failed', error);
      return previous;
    }
  }

  const apiKey = dependencies.getApiKey();
  if (!apiKey) {
    warnMemory('gemini-refresh-failed');
    return previous;
  }
  const model = dependencies.resolveModel();

  let normalized: InboxAiMemoryJson;
  try {
    const generated = await dependencies.generateJson({
      apiKey,
      model,
      prompt: buildMemoryPrompt(previous, params.transcript),
      temperature: 0,
      maxOutputTokens: 2_048,
      responseJsonSchema: INBOX_AI_MEMORY_RESPONSE_SCHEMA,
      logScope: 'inbox-ai-memory',
      logResponsePreview: false,
    });
    normalized = normalizeInboxAiMemoryJson(generated);
  } catch (error) {
    warnMemory('gemini-refresh-failed', error);
    return previous;
  }

  const updatedAt = dependencies.now();
  const refreshed: InboxAiMemory = {
    stableKey: params.stableKey,
    ...normalized,
    lastSummarizedMessageAt: params.historyMeta.newestAt ?? null,
    messageCount: totalVisibleMessageCount,
    model,
    updatedAt,
  };
  const row = {
    stable_key: refreshed.stableKey,
    summary: refreshed.summary,
    preferences: refreshed.preferences,
    objections: refreshed.objections,
    agreements: refreshed.agreements,
    last_summarized_message_at: refreshed.lastSummarizedMessageAt,
    message_count: refreshed.messageCount,
    model: refreshed.model,
    updated_at: refreshed.updatedAt,
  };

  try {
    const { error } = await params.supabase
      .from(MEMORY_TABLE)
      .upsert(row, { onConflict: 'stable_key' });
    if (error) throw error;
    return refreshed;
  } catch (error) {
    warnMemory('memory-upsert-failed', error);
    return previous;
  }
}

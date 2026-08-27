// deno-lint-ignore-file no-explicit-any
import { DEFAULT_HISTORY_LIMIT } from './conversationHistory.ts';
import { DEFAULT_GEMINI_MODEL, getGeminiApiKey, geminiAnalyzeImage, resolveGeminiModel } from './geminiClient.ts';
import {
  MAX_IMAGE_ANALYSIS_BYTES,
  VISION_REUSE_MODEL_PREFIX,
  countsTowardVisionQuota,
  isAnalyzableInboundImage,
  pickImagesToAnalyze,
  remainingVisionQuota,
  visionSinceIso,
} from './inboxAiMediaLimits.ts';
import { downloadWhatsAppBucketBytes } from './whatsappMediaStorage.ts';

type SupabaseClient = any;

export interface AnalyzeImageItemResult {
  messageLogId: string;
  status: 'completed' | 'cached' | 'reused' | 'skipped' | 'failed';
  analysis?: string;
  reason?: string;
}

export interface AnalyzeImagesBatchResult {
  analyzed: number;
  cached: number;
  reused: number;
  skipped: AnalyzeImageItemResult[];
  failed: AnalyzeImageItemResult[];
  items: AnalyzeImageItemResult[];
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

async function withOneRetry<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    return await work();
  }
}

async function countRecentVisionUsage(
  supabase: SupabaseClient,
  stableKey: string,
): Promise<number> {
  const since = visionSinceIso();
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select('media_analysis_status,media_analysis_model,media_analysis_at,media_analysis_failed_at')
    .eq('conversation_stable_key', stableKey)
    .or(
      `media_analysis_at.gte.${since},media_analysis_failed_at.gte.${since},media_analysis_status.eq.pending`,
    );
  if (error) throw error;
  return (data ?? []).filter((row: Record<string, unknown>) => countsTowardVisionQuota(row, since)).length;
}

async function reuseAnalysisBySha256(
  supabase: SupabaseClient,
  messageLogId: string,
): Promise<{ text: string; model: string; bytes: number | null } | null> {
  const { data: asset } = await supabase
    .from('whatsapp_media_assets')
    .select('sha256')
    .eq('message_log_id', messageLogId)
    .maybeSingle();
  const sha256 = typeof asset?.sha256 === 'string' ? asset.sha256.trim() : '';
  if (!sha256) return null;

  const { data: siblings } = await supabase
    .from('whatsapp_media_assets')
    .select('message_log_id')
    .eq('sha256', sha256)
    .neq('message_log_id', messageLogId)
    .limit(20);
  const ids = (siblings ?? [])
    .map((row: { message_log_id?: string | null }) => row.message_log_id)
    .filter((id: string | null | undefined): id is string => Boolean(id));
  if (!ids.length) return null;

  const { data: reused } = await supabase
    .from('whatsapp_message_log')
    .select('media_analysis_text,media_analysis_model,media_analysis_bytes')
    .in('id', ids)
    .not('media_analysis_text', 'is', null)
    .limit(1)
    .maybeSingle();
  const text = typeof reused?.media_analysis_text === 'string' ? reused.media_analysis_text.trim() : '';
  if (!text) return null;
  return {
    text,
    model: String(reused.media_analysis_model || DEFAULT_GEMINI_MODEL),
    bytes: typeof reused.media_analysis_bytes === 'number' ? reused.media_analysis_bytes : null,
  };
}

async function persistAnalysis(
  supabase: SupabaseClient,
  messageLogId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('whatsapp_message_log').update(patch).eq('id', messageLogId);
  if (error) throw error;
}

export async function analyzeInboundImageById(
  supabase: SupabaseClient,
  messageLogId: string,
  options?: { force?: boolean },
): Promise<AnalyzeImageItemResult> {
  const { data: row, error } = await supabase
    .from('whatsapp_message_log')
    .select(
      'id,direction,media_type,storage_path,size_bytes,mime_type,media_analysis_text,conversation_stable_key',
    )
    .eq('id', messageLogId)
    .single();
  if (error) {
    return { messageLogId, status: 'failed', reason: formatUnknownError(error) };
  }

  const analyzable = isAnalyzableInboundImage(row);
  if (!analyzable.ok) {
    return { messageLogId, status: 'skipped', reason: analyzable.reason };
  }

  if (row.media_analysis_text && !options?.force) {
    return {
      messageLogId,
      status: 'cached',
      analysis: String(row.media_analysis_text),
    };
  }

  const reused = await reuseAnalysisBySha256(supabase, messageLogId);
  if (reused && !options?.force) {
    await persistAnalysis(supabase, messageLogId, {
      media_analysis_text: reused.text,
      media_analysis_at: new Date().toISOString(),
      media_analysis_model: `${VISION_REUSE_MODEL_PREFIX}${reused.model}`,
      media_analysis_bytes: reused.bytes,
      media_analysis_status: 'completed',
      media_analysis_error: null,
      media_analysis_failed_at: null,
    });
    return { messageLogId, status: 'reused', analysis: reused.text };
  }

  const used = await countRecentVisionUsage(supabase, String(row.conversation_stable_key));
  if (remainingVisionQuota(used) <= 0) {
    return { messageLogId, status: 'skipped', reason: 'daily_cap' };
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { messageLogId, status: 'failed', reason: 'GEMINI_API_KEY no configurada.' };
  }

  await persistAnalysis(supabase, messageLogId, {
    media_analysis_status: 'pending',
    media_analysis_error: null,
  });

  try {
    const buffer = await downloadWhatsAppBucketBytes(supabase, String(row.storage_path));
    if (buffer.byteLength > MAX_IMAGE_ANALYSIS_BYTES) {
      await persistAnalysis(supabase, messageLogId, {
        media_analysis_status: 'failed',
        media_analysis_error: 'too_large',
        media_analysis_failed_at: new Date().toISOString(),
      });
      return { messageLogId, status: 'skipped', reason: 'too_large' };
    }

    const model = resolveGeminiModel('GEMINI_MODEL_IMAGE_ANALYSIS', DEFAULT_GEMINI_MODEL);
    const analysis = await withOneRetry(() => geminiAnalyzeImage({
      apiKey,
      buffer,
      mimeType: String(row.mime_type || 'image/jpeg'),
      model,
    }));

    await persistAnalysis(supabase, messageLogId, {
      media_analysis_text: analysis,
      media_analysis_at: new Date().toISOString(),
      media_analysis_model: model,
      media_analysis_bytes: buffer.byteLength,
      media_analysis_status: 'completed',
      media_analysis_error: null,
      media_analysis_failed_at: null,
    });
    return { messageLogId, status: 'completed', analysis };
  } catch (error) {
    const message = formatUnknownError(error);
    await persistAnalysis(supabase, messageLogId, {
      media_analysis_status: 'failed',
      media_analysis_error: message,
      media_analysis_failed_at: new Date().toISOString(),
    });
    return { messageLogId, status: 'failed', reason: message };
  }
}

export async function analyzeUncachedInboundImagesForConversation(
  supabase: SupabaseClient,
  stableKey: string,
  options?: {
    messageLogIds?: string[];
    force?: boolean;
    historyLimit?: number;
  },
): Promise<AnalyzeImagesBatchResult> {
  const limit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select(
      'id,direction,media_type,storage_path,size_bytes,mime_type,media_analysis_text,hidden_from_panel',
    )
    .eq('conversation_stable_key', stableKey)
    .eq('hidden_from_panel', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const wanted = new Set((options?.messageLogIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  const rows = (data ?? []).filter((row: Record<string, unknown>) => {
    if (wanted.size && !wanted.has(String(row.id))) return false;
    return true;
  });

  const cachedItems: AnalyzeImageItemResult[] = [];
  const eligible: string[] = [];
  const preSkipped: AnalyzeImageItemResult[] = [];

  for (const row of rows) {
    const id = String(row.id);
    const analyzable = isAnalyzableInboundImage(row);
    if (!analyzable.ok) {
      if (wanted.size) preSkipped.push({ messageLogId: id, status: 'skipped', reason: analyzable.reason });
      continue;
    }
    if (row.media_analysis_text && !options?.force) {
      cachedItems.push({
        messageLogId: id,
        status: 'cached',
        analysis: String(row.media_analysis_text),
      });
      continue;
    }
    eligible.push(id);
  }

  const used = await countRecentVisionUsage(supabase, stableKey);
  const picked = pickImagesToAnalyze(eligible, remainingVisionQuota(used));
  const items: AnalyzeImageItemResult[] = [
    ...cachedItems,
    ...preSkipped,
    ...picked.skipped.map((skip) => ({
      messageLogId: skip.id,
      status: 'skipped' as const,
      reason: skip.reason,
    })),
  ];

  let analyzed = 0;
  let reused = 0;
  const failed: AnalyzeImageItemResult[] = [];

  for (const id of picked.selected) {
    const result = await analyzeInboundImageById(supabase, id, { force: options?.force });
    items.push(result);
    if (result.status === 'completed') analyzed += 1;
    if (result.status === 'reused') reused += 1;
    if (result.status === 'failed') failed.push(result);
  }

  return {
    analyzed,
    cached: cachedItems.length,
    reused,
    skipped: items.filter((item) => item.status === 'skipped'),
    failed,
    items,
  };
}

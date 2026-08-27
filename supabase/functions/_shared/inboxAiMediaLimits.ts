export const MAX_STT_AUDIO_BYTES = 16 * 1024 * 1024;
export const MAX_IMAGE_ANALYSIS_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_ANALYSIS_REQUEST = 8;
export const MAX_IMAGE_ANALYSES_PER_CONVERSATION_24H = 20;
export const IMAGE_ANALYSIS_PREFIX = '[Imagen]:';
export const VISION_REUSE_MODEL_PREFIX = 'reuse:';

export function isVoiceTranscriptionFeatureEnabled(
  envValue: string | null | undefined,
): boolean {
  if (!envValue) return true;
  return !['0', 'false', 'off', 'no'].includes(envValue.trim().toLowerCase());
}

export function inboundAudioNeedsAutoTranscription(params: {
  mediaType?: string | null;
  messageLogId?: string | null;
  mediaId?: string | null;
}): boolean {
  return params.mediaType === 'audio'
    && Boolean(params.messageLogId)
    && Boolean(params.mediaId);
}

export function isAnalyzableInboundImage(row: {
  direction?: unknown;
  media_type?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
  mime_type?: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (row.direction !== 'inbound') return { ok: false, reason: 'not_inbound' };
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  if (mediaType !== 'image') return { ok: false, reason: 'not_image' };
  if (!String(row.storage_path ?? '').trim()) return { ok: false, reason: 'no_storage_path' };
  const size = Number(row.size_bytes ?? 0);
  if (Number.isFinite(size) && size > MAX_IMAGE_ANALYSIS_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const mime = String(row.mime_type ?? '').trim().toLowerCase();
  if (mime && !mime.startsWith('image/')) return { ok: false, reason: 'bad_mime' };
  return { ok: true };
}

export function countsTowardVisionQuota(
  row: {
    media_analysis_status?: unknown;
    media_analysis_model?: unknown;
    media_analysis_at?: unknown;
    media_analysis_failed_at?: unknown;
  },
  sinceIso: string,
): boolean {
  const model = String(row.media_analysis_model ?? '');
  if (model.startsWith(VISION_REUSE_MODEL_PREFIX)) return false;
  if (row.media_analysis_status === 'pending') return true;
  const at = [row.media_analysis_at, row.media_analysis_failed_at]
    .map((value) => typeof value === 'string' ? value : '')
    .find((value) => value >= sinceIso);
  return Boolean(at);
}

export function remainingVisionQuota(usedInLast24h: number): number {
  const used = Number.isFinite(usedInLast24h) ? Math.max(0, Math.floor(usedInLast24h)) : 0;
  return Math.max(0, MAX_IMAGE_ANALYSES_PER_CONVERSATION_24H - used);
}

export function pickImagesToAnalyze(
  eligibleIds: string[],
  remainingQuota: number,
): {
  selected: string[];
  skipped: Array<{ id: string; reason: 'daily_cap' | 'max_per_request' }>;
} {
  const quota = Math.max(0, Math.floor(remainingQuota));
  const cap = Math.min(MAX_IMAGES_PER_ANALYSIS_REQUEST, quota);
  const selected = eligibleIds.slice(0, cap);
  const reason = quota <= 0 ? 'daily_cap' as const : 'max_per_request' as const;
  return {
    selected,
    skipped: eligibleIds.slice(cap).map((id) => ({ id, reason })),
  };
}

export function visionSinceIso(nowMs = Date.now()): string {
  return new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
}

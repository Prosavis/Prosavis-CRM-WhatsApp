/** Límites de Storage y media — fuente compartida Edge (espejo de src/constants/storageLimits.ts). */

export const PLAN_FREE_STORAGE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB Supabase Free

export const WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES = 104_857_600; // 100 MB/objeto
export const STORAGE_RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const STORAGE_TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export const STORAGE_ALERT_WARNING_PERCENT = 80;
export const STORAGE_ALERT_CRITICAL_PERCENT = 90;

export const META_MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  sticker: 500 * 1024,
} as const;

export const STORAGE_LIMITS = {
  planFreeBytes: PLAN_FREE_STORAGE_BYTES,
  bucketObjectMaxBytes: WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES,
  tusThresholdBytes: STORAGE_RESUMABLE_THRESHOLD_BYTES,
  tusChunkBytes: STORAGE_TUS_CHUNK_BYTES,
  warningPercent: STORAGE_ALERT_WARNING_PERCENT,
  criticalPercent: STORAGE_ALERT_CRITICAL_PERCENT,
  buckets: ['whatsapp-media', 'whatsapp-stickers', 'crm-contact-photos'] as const,
} as const;

export const STORAGE_ERROR_CODES = [
  'storage_oversized',
  'storage',
  'meta_download',
  'meta_unavailable',
  'meta_auth',
  'config',
] as const;

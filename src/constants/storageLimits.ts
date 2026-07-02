/** Límites de Storage y media — fuente compartida frontend (espejo de _shared/storageLimits.ts). */

export const PLAN_FREE_STORAGE_BYTES = 1 * 1024 * 1024 * 1024;

export const WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES = 104_857_600;
export const STORAGE_RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;

export const STORAGE_ALERT_WARNING_PERCENT = 80;
export const STORAGE_ALERT_CRITICAL_PERCENT = 90;

export const META_MEDIA_LIMITS = {
  image: { label: 'Imagen', maxBytes: 5 * 1024 * 1024, maxLabel: '5 MB' },
  video: { label: 'Video', maxBytes: 16 * 1024 * 1024, maxLabel: '16 MB' },
  audio: { label: 'Audio', maxBytes: 16 * 1024 * 1024, maxLabel: '16 MB' },
  document: { label: 'Documento/PDF', maxBytes: 100 * 1024 * 1024, maxLabel: '100 MB' },
  sticker: { label: 'Sticker WebP', maxBytes: 500 * 1024, maxLabel: '500 KB' },
} as const;

export const STORAGE_LIMITS = {
  planFreeBytes: PLAN_FREE_STORAGE_BYTES,
  bucketObjectMaxBytes: WHATSAPP_MEDIA_BUCKET_LIMIT_BYTES,
  bucketObjectMaxLabel: '100 MB',
  tusThresholdBytes: STORAGE_RESUMABLE_THRESHOLD_BYTES,
  tusThresholdLabel: '6 MB',
  warningPercent: STORAGE_ALERT_WARNING_PERCENT,
  criticalPercent: STORAGE_ALERT_CRITICAL_PERCENT,
  buckets: [
    { id: 'whatsapp-media', label: 'Media WhatsApp' },
    { id: 'whatsapp-stickers', label: 'Stickers' },
    { id: 'crm-contact-photos', label: 'Fotos contacto' },
  ],
} as const;

export const STORAGE_ERROR_CODES: Record<string, string> = {
  storage_oversized: 'Archivo excede 100 MB (límite global y bucket whatsapp-media)',
  storage: 'Error al guardar en Storage',
  meta_download: 'No se pudo descargar media de Meta',
  meta_unavailable: 'Media ya no disponible en Meta',
  meta_auth: 'Error de autenticación con Meta',
  config: 'Configuración incompleta del servidor',
};

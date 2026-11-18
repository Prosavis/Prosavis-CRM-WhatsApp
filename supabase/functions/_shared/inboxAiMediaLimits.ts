export const MAX_STT_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_ANALYSIS_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_ANALYSIS_BYTES = 30 * 1024 * 1024;
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

export function canTranscribePersistedAudio(row: {
  media_type?: unknown;
  media_id?: unknown;
  storage_path?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): boolean {
  const mediaId = String(row.media_id ?? '').trim();
  const storagePath = String(row.storage_path ?? '').trim();
  if (!mediaId && !storagePath) return false;
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  if (mediaType === 'audio') return true;
  return isAudioAttachment(row);
}

export function inboundAudioNeedsAutoTranscription(params: {
  mediaType?: string | null;
  messageLogId?: string | null;
  mediaId?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  filename?: string | null;
}): boolean {
  return Boolean(params.messageLogId)
    && canTranscribePersistedAudio({
      media_type: params.mediaType,
      media_id: params.mediaId,
      storage_path: params.storagePath,
      mime_type: params.mimeType,
      filename: params.filename,
    });
}

export function isAnalyzableInboundImage(row: {
  direction?: unknown;
  media_type?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (row.direction !== 'inbound') return { ok: false, reason: 'not_inbound' };
  const block = inboundMediaBlockReason(row);
  if (block?.startsWith('El video')) return { ok: false, reason: 'video_no_soportado' };
  if (block) return { ok: false, reason: 'formato_no_soportado' };
  if (!isInboundImageAttachment(row)) return { ok: false, reason: 'not_image' };
  if (!String(row.storage_path ?? '').trim()) return { ok: false, reason: 'no_storage_path' };
  const size = Number(row.size_bytes ?? 0);
  if (Number.isFinite(size) && size > MAX_IMAGE_ANALYSIS_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}

const OFFICE_MIME_BY_EXTENSION: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  odt: 'application/vnd.oasis.opendocument.text',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

const TEXT_EXTENSIONS = new Set([
  'txt', 'csv', 'md', 'markdown', 'html', 'htm', 'xml', 'json', 'log', 'rtf',
]);

const CODE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'sql', 'sh', 'bash', 'ps1',
  'php', 'rb', 'go', 'java', 'cs', 'dart', 'yml', 'yaml',
]);

const BLOCKED_EXTENSIONS = new Set([
  'docm', 'xlsm', 'pptm', 'env', 'pem', 'key', 'p12', 'pfx',
]);

const BLOCKED_MIMES = new Set([
  'application/vnd.ms-word.document.macroenabled.12',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-powerpoint.presentation.macroenabled.12',
]);

const CODE_MIMES = new Set([
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'text/typescript',
  'application/typescript',
  'text/x-python',
  'application/x-python',
  'text/x-python-script',
  'application/sql',
  'text/x-sql',
  'application/x-sh',
  'text/x-sh',
  'text/x-shellscript',
  'application/x-php',
  'text/x-php',
  'text/x-ruby',
  'application/x-ruby',
  'text/x-go',
  'text/x-java-source',
  'text/x-csharp',
  'text/x-dart',
  'text/yaml',
  'text/x-yaml',
  'application/yaml',
  'application/x-yaml',
]);

const TEXT_MIMES = new Set([
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/md',
  'text/xml',
  'application/xml',
  'application/json',
  'text/json',
  'application/xhtml+xml',
]);

const GENERIC_DOCUMENT_MIMES = new Set([
  '',
  'application/octet-stream',
  'application/binary',
  'binary/octet-stream',
]);

function baseMime(mime: unknown): string {
  return String(mime ?? '').split(';')[0].trim().toLowerCase();
}

function inboundDocumentExtension(filename: unknown): string {
  const trimmed = String(filename ?? '').trim().toLowerCase();
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  if (!base || base === '.' || base === '..') return '';
  if (base === '.env' || base.endsWith('.env') || base.includes('.env.')) return 'env';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1);
}

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif', 'svg',
]);

const AUDIO_EXTENSIONS = new Set([
  'ogg', 'opus', 'mp3', 'wav', 'aac', 'm4a', 'm4b', 'flac', 'aiff', 'aif',
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', '3gp', '3gpp', 'm4v']);

export function inboundMediaBlockReason(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): string | null {
  const mime = baseMime(row.mime_type);
  const ext = inboundDocumentExtension(row.filename);
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  if (mediaType === 'video' || mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    return 'El video no se analiza.';
  }
  if (ext === 'amr' || mime === 'audio/amr' || mime === 'audio/amr-wb') {
    return 'Formato AMR no soportado.';
  }
  if (ext === 'webm' || mime === 'audio/webm' || mime === 'video/webm') {
    return 'Formato WebM no soportado.';
  }
  return null;
}

export function isInboundImageAttachment(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): boolean {
  if (inboundMediaBlockReason(row)) return false;
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  const mime = baseMime(row.mime_type);
  const ext = inboundDocumentExtension(row.filename);
  if (mediaType === 'image' || mediaType === 'sticker') return true;
  return mediaType === 'document' && (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext));
}

function isAudioAttachment(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): boolean {
  if (inboundMediaBlockReason(row)) return false;
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  const mime = baseMime(row.mime_type);
  const ext = inboundDocumentExtension(row.filename);
  if (mediaType === 'audio') return true;
  return mediaType === 'document' && (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext));
}

export function isInboundPdfDocument(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): boolean {
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  if (mediaType !== 'document') return false;
  const mime = baseMime(row.mime_type);
  if (mime === 'application/pdf') return true;
  return inboundDocumentExtension(row.filename) === 'pdf';
}

/**
 * Word, Excel, PowerPoint, TXT y scripts de texto.
 * PDF no entra: sigue en `isInboundPdfDocument`.
 * El MIME que devuelve es el que se manda a Gemini (`text/plain` si es texto o código).
 */
export function resolveInboundDocumentForGemini(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): { geminiMimeType: string; code: boolean } | null {
  if (String(row.media_type ?? '').trim().toLowerCase() !== 'document') return null;
  if (isInboundPdfDocument(row)) return null;
  const extension = inboundDocumentExtension(row.filename);
  if (BLOCKED_EXTENSIONS.has(extension)) return null;
  const mime = baseMime(row.mime_type);
  if (BLOCKED_MIMES.has(mime)) return null;

  const officeFromMime = Object.values(OFFICE_MIME_BY_EXTENSION).includes(mime) ? mime : '';
  if (officeFromMime && GENERIC_DOCUMENT_MIMES.has(mime) === false) {
    return { geminiMimeType: officeFromMime, code: false };
  }
  const officeFromExtension = OFFICE_MIME_BY_EXTENSION[extension];
  if (officeFromExtension) {
    return { geminiMimeType: officeFromExtension, code: false };
  }
  if (CODE_EXTENSIONS.has(extension) || CODE_MIMES.has(mime)) {
    return { geminiMimeType: 'text/plain', code: true };
  }
  if (TEXT_EXTENSIONS.has(extension) || TEXT_MIMES.has(mime)) {
    return { geminiMimeType: 'text/plain', code: false };
  }
  return null;
}

export function isInboundOfficeOrTextDocument(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): boolean {
  return resolveInboundDocumentForGemini(row) !== null;
}

export function isAnalyzableInboundPdf(row: {
  direction?: unknown;
  media_type?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (row.direction !== 'inbound') return { ok: false, reason: 'not_inbound' };
  if (!isInboundPdfDocument(row)) return { ok: false, reason: 'not_pdf' };
  if (!String(row.storage_path ?? '').trim()) return { ok: false, reason: 'no_storage_path' };
  const size = Number(row.size_bytes ?? 0);
  if (Number.isFinite(size) && size > MAX_PDF_ANALYSIS_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}

export function isAnalyzableInboundDocument(row: {
  direction?: unknown;
  media_type?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): { ok: true } | { ok: false; reason: string } {
  if (row.direction !== 'inbound') return { ok: false, reason: 'not_inbound' };
  if (!isInboundOfficeOrTextDocument(row)) return { ok: false, reason: 'not_document' };
  if (!String(row.storage_path ?? '').trim()) return { ok: false, reason: 'no_storage_path' };
  const size = Number(row.size_bytes ?? 0);
  if (Number.isFinite(size) && size > MAX_PDF_ANALYSIS_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}

export function classifyAnalyzableInboundMedia(row: {
  direction?: unknown;
  media_type?: unknown;
  storage_path?: unknown;
  size_bytes?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): { ok: true; kind: 'image' | 'pdf' | 'document' } | { ok: false; reason: string } {
  const block = inboundMediaBlockReason(row);
  if (block?.startsWith('El video')) return { ok: false, reason: 'video_no_soportado' };
  if (block) return { ok: false, reason: 'formato_no_soportado' };
  if (isInboundImageAttachment(row)) {
    const image = isAnalyzableInboundImage(row);
    if (image.ok) return { ok: true, kind: 'image' };
    return image;
  }
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  if (mediaType === 'document' && isAudioAttachment(row)) return { ok: false, reason: 'es_audio' };
  if (mediaType === 'document') {
    const pdf = isAnalyzableInboundPdf(row);
    if (pdf.ok) return { ok: true, kind: 'pdf' };
    if (isInboundPdfDocument(row)) return pdf;
    const document = isAnalyzableInboundDocument(row);
    if (document.ok) return { ok: true, kind: 'document' };
    return document;
  }
  const image = isAnalyzableInboundImage(row);
  if (image.ok) return { ok: true, kind: 'image' };
  return image;
}

export function shouldQueueInboundMediaAnalysis(row: {
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
}): boolean {
  if (inboundMediaBlockReason(row)) return false;
  const mediaType = String(row.media_type ?? '').trim().toLowerCase();
  if (mediaType === 'sticker') return false;
  if (mediaType === 'image') return true;
  if (mediaType !== 'document') return false;
  if (isAudioAttachment(row)) return false;
  if (isInboundImageAttachment(row)) return true;
  if (isInboundPdfDocument(row)) return true;
  return isInboundOfficeOrTextDocument(row);
}

export interface PendingInboundAttachment {
  messageLogId: string;
  tipo: 'image' | 'audio' | 'document';
  filename: string;
}

export function pendingInboundAttachment(row: {
  id?: unknown;
  media_type?: unknown;
  mime_type?: unknown;
  filename?: unknown;
  media_analysis_text?: unknown;
  voice_transcription?: unknown;
  direction?: unknown;
}): PendingInboundAttachment | null {
  if (row.direction && String(row.direction) !== 'inbound') return null;
  if (inboundMediaBlockReason(row)) return null;
  const id = String(row.id ?? '').trim();
  if (!id) return null;
  const filename = String(row.filename ?? '').trim();
  if (isAudioAttachment(row)) {
    if (String(row.voice_transcription ?? '').trim()) return null;
    return { messageLogId: id, tipo: 'audio', filename };
  }
  if (isInboundImageAttachment(row) || isInboundPdfDocument(row) || isInboundOfficeOrTextDocument(row)) {
    if (String(row.media_analysis_text ?? '').trim()) return null;
    const tipo = isInboundImageAttachment(row) ? 'image' as const : 'document' as const;
    return { messageLogId: id, tipo, filename };
  }
  return null;
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

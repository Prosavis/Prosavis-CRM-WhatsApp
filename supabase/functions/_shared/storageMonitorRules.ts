export const RESERVED_STORAGE_PREFIXES = ['whatsapp-media', 'unknown'] as const;

export const DELETE_STORAGE_ORPHANS_CONFIRM = 'ELIMINAR_HUERFANOS_STORAGE';

export function isReservedStoragePrefix(stableKey: string): boolean {
  return (RESERVED_STORAGE_PREFIXES as readonly string[]).includes(stableKey.trim());
}

export function mediaIdFromStoragePath(storagePath: string): string | null {
  const file = storagePath.split('/').pop()?.trim() ?? '';
  if (!file) return null;
  const dot = file.lastIndexOf('.');
  const id = (dot > 0 ? file.slice(0, dot) : file).trim();
  return id.length > 0 ? id : null;
}

export function isSafeStorageOrphan(params: {
  storagePath: string;
  indexedPaths: Iterable<string>;
  messageLogPaths: Iterable<string>;
  messageLogMediaIds: Iterable<string>;
}): boolean {
  const path = params.storagePath.trim();
  if (!path) return false;

  const indexed = params.indexedPaths instanceof Set
    ? params.indexedPaths
    : new Set(params.indexedPaths);
  const logPaths = params.messageLogPaths instanceof Set
    ? params.messageLogPaths
    : new Set(params.messageLogPaths);
  const mediaIds = params.messageLogMediaIds instanceof Set
    ? params.messageLogMediaIds
    : new Set(params.messageLogMediaIds);

  if (indexed.has(path)) return false;
  if (logPaths.has(path)) return false;
  const mediaId = mediaIdFromStoragePath(path);
  if (mediaId && mediaIds.has(mediaId)) return false;
  return true;
}

export function objectSizeBytes(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const size = (metadata as { size?: unknown }).size;
  if (typeof size === 'number' && Number.isFinite(size)) return size;
  const parsed = Number(size);
  return Number.isFinite(parsed) ? parsed : 0;
}

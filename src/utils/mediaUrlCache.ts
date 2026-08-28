type CachedMediaUrl = {
  url: string;
  mimeType: string;
  fileSize: number;
  expiresAt: number;
};

const cache = new Map<string, CachedMediaUrl>();
const DEFAULT_TTL_MS = 8 * 60 * 1000;

export function mediaUrlCacheKey(params: {
  mediaId?: string;
  storagePath?: string;
  mediaAssetId?: string;
}): string {
  return [params.mediaId ?? '', params.storagePath ?? '', params.mediaAssetId ?? ''].join('|');
}

export function getCachedMediaUrl(key: string): CachedMediaUrl | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setCachedMediaUrl(
  key: string,
  value: Omit<CachedMediaUrl, 'expiresAt'>,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  cache.set(key, { ...value, expiresAt: Date.now() + ttlMs });
}

export function clearMediaUrlCache(): void {
  cache.clear();
}

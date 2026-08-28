import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMediaUrlCache,
  getCachedMediaUrl,
  mediaUrlCacheKey,
  setCachedMediaUrl,
} from './mediaUrlCache';

describe('mediaUrlCache', () => {
  afterEach(() => {
    clearMediaUrlCache();
  });

  it('returns a cached signed URL before expiry', () => {
    const key = mediaUrlCacheKey({ mediaId: 'm1', storagePath: 'a/b' });
    setCachedMediaUrl(key, { url: 'https://signed', mimeType: 'image/jpeg', fileSize: 12 });
    expect(getCachedMediaUrl(key)?.url).toBe('https://signed');
  });

  it('expires cached URLs', () => {
    const key = mediaUrlCacheKey({ mediaId: 'm2' });
    setCachedMediaUrl(key, { url: 'https://old', mimeType: 'image/jpeg', fileSize: 1 }, -1);
    expect(getCachedMediaUrl(key)).toBeNull();
  });
});

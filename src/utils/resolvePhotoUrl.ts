/**
 * Resuelve photoUrl a una URL de descarga válida.
 * La App guarda paths relativos de Storage; Google y otros proveedores usan URLs HTTP.
 */

import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/config/firebase';

const resolvedPhotoUrlCache = new Map<string, string | undefined>();

export function isHttpPhotoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export async function resolvePhotoUrl(
  rawPhotoUrl: string | undefined | null,
): Promise<string | undefined> {
  if (!rawPhotoUrl?.trim()) return undefined;

  const trimmed = rawPhotoUrl.trim();
  if (isHttpPhotoUrl(trimmed)) return trimmed;

  if (resolvedPhotoUrlCache.has(trimmed)) {
    return resolvedPhotoUrlCache.get(trimmed);
  }

  try {
    const storageRef = ref(storage, trimmed);
    const downloadUrl = await getDownloadURL(storageRef);
    resolvedPhotoUrlCache.set(trimmed, downloadUrl);
    return downloadUrl;
  } catch {
    resolvedPhotoUrlCache.set(trimmed, undefined);
    return undefined;
  }
}

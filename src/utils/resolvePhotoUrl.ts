/**
 * Resuelve photoUrl a una URL de descarga válida.
 * La App guarda paths relativos de Storage; Google y otros proveedores usan URLs HTTP.
 * Las fotos subidas en Ficha cliente viven en Supabase (`supabase://crm-contact-photos/...`).
 */

import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { supabase } from '@/config/supabase';
import {
  CRM_CONTACT_PHOTOS_BUCKET,
  crmContactPhotoStoragePath,
  isCrmContactPhotoRef,
} from '@/utils/contactPhotoStorage';

const resolvedPhotoUrlCache = new Map<string, string | undefined>();
const CRM_CONTACT_PHOTO_SIGNED_TTL_SECONDS = 60 * 60 * 24 * 7;

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

  if (isCrmContactPhotoRef(trimmed)) {
    try {
      const path = crmContactPhotoStoragePath(trimmed);
      const { data, error } = await supabase.storage
        .from(CRM_CONTACT_PHOTOS_BUCKET)
        .createSignedUrl(path, CRM_CONTACT_PHOTO_SIGNED_TTL_SECONDS);
      const signed = error ? undefined : data?.signedUrl;
      resolvedPhotoUrlCache.set(trimmed, signed);
      return signed;
    } catch {
      resolvedPhotoUrlCache.set(trimmed, undefined);
      return undefined;
    }
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

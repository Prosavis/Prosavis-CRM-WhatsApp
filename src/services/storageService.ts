import { supabase } from '@/config/supabase';

export interface UploadResult {
  storagePath: string;
  /** Signed URL (2h) que el frontend puede usar para previsualización inmediata. */
  publicUrl: string;
}

/** Extrae mensaje útil de StorageError / objetos no-Error de supabase-js. */
export function formatStorageUploadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; error?: unknown; statusCode?: unknown };
    const parts = [record.message, record.error, record.statusCode]
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      .map(String)
      .filter((value) => value.trim().length > 0);
    if (parts.length) return parts.join(' — ');
  }
  return 'No se pudo subir el archivo a Storage.';
}

export async function uploadWhatsAppStorageFile(
  bucket: 'whatsapp-media' | 'whatsapp-stickers',
  storagePath: string,
  file: File,
): Promise<UploadResult> {
  // Paths de outbound ya son únicos (UUID/timestamp); upsert + versionado de Storage
  // puede fallar en overwrite. Refrescamos sesión por si el JWT del Storage expiró.
  await supabase.auth.refreshSession().catch(() => undefined);

  const { data, error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: '3600',
  });
  if (error) throw new Error(formatStorageUploadError(error));

  let publicUrl = '';
  try {
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(data.path, 7200);
    if (signed?.signedUrl) publicUrl = signed.signedUrl;
  } catch {
    // El signed URL client-side puede fallar si el token expiró.
    // La Edge Function creará su propio signed URL con service_role.
  }

  return {
    storagePath: data.path,
    publicUrl,
  };
}

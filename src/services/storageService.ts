import { supabase } from '@/config/supabase';

export interface UploadResult {
  storagePath: string;
  /** Signed URL (2h) que el frontend puede usar para previsualización inmediata. */
  publicUrl: string;
}

export async function uploadWhatsAppStorageFile(
  bucket: 'whatsapp-media' | 'whatsapp-stickers',
  storagePath: string,
  file: File,
): Promise<UploadResult> {
  const { data, error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

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

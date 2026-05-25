import { supabase } from '@/config/supabase';

export async function uploadWhatsAppStorageFile(
  bucket: 'whatsapp-media' | 'whatsapp-stickers',
  storagePath: string,
  file: File,
): Promise<{ storagePath: string; publicUrl: string }> {
  const { data, error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(data.path, 3600);
  if (signError || !signed?.signedUrl) throw signError ?? new Error('No se pudo firmar URL.');
  return { storagePath: data.path, publicUrl: signed.signedUrl };
}

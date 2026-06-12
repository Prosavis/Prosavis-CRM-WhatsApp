import { supabase } from '@/config/supabase';
import { directoryService } from '@/services/directoryService';
import type { DirectoryEntry } from '@/types/lead';

export async function updateUserProfileViaFunction(
  payload: Record<string, string>,
  userId: string,
): Promise<{ success: boolean }> {
  const phoneDigits = (payload.phoneNumber ?? userId).replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    throw new Error('Teléfono inválido para actualizar perfil.');
  }

  const name = payload.name?.trim() || payload.displayName?.trim() || undefined;
  const photoUrl = payload.photoUrl?.trim() || payload.photoURL?.trim() || undefined;
  const email = payload.email?.trim() || undefined;
  const notes = payload.bio?.trim() || undefined;
  const address = payload.address?.trim() || undefined;

  const metadataPatch: Record<string, unknown> = {};
  if (payload.department?.trim()) metadataPatch.department = payload.department.trim();
  if (payload.city?.trim()) metadataPatch.city = payload.city.trim();

  // Centralizado en crm_directory (fuente única de contactos).
  const existing = (await directoryService.findByPhone(phoneDigits))[0] ?? null;
  const mergedMetadata = {
    ...(existing?.metadata ?? {}),
    ...metadataPatch,
  };

  const patch: Partial<DirectoryEntry> = {
    phone: payload.phoneNumber?.trim() || phoneDigits,
    appUserId: userId,
    ...(name !== undefined ? { displayName: name } : {}),
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(Object.keys(mergedMetadata).length > 0 ? { metadata: mergedMetadata } : {}),
  };

  if (existing) {
    await directoryService.updateEntry(existing.id, patch);
  } else {
    await directoryService.createEntry({
      fullName: name ?? '',
      ...patch,
    });
  }

  const convPatch: Record<string, string | null> = {};
  if (name) convPatch.contact_name = name;
  if (photoUrl) convPatch.contact_photo_url = photoUrl;

  if (Object.keys(convPatch).length > 0) {
    const { error: convError } = await supabase
      .from('whatsapp_conversations')
      .update(convPatch)
      .eq('stable_key', phoneDigits);
    if (convError) throw convError;
  }

  return { success: true };
}

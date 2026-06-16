import { supabase } from '@/config/supabase';
import { directoryService } from '@/services/directoryService';
import type { DirectoryEntry } from '@/types/lead';
import {
  looksLikePhoneValue,
  resolveContactPhoneForSave,
} from '@/utils/directoryPhone';

export interface UpdateUserProfileContext {
  fallbackPhone?: string;
  directoryEntryId?: string;
}

export async function updateUserProfileViaFunction(
  payload: Record<string, string>,
  userId: string,
  context?: UpdateUserProfileContext,
): Promise<{ success: boolean }> {
  let existing: DirectoryEntry | null = null;

  if (context?.directoryEntryId) {
    existing = await directoryService.getEntryById(context.directoryEntryId);
  }
  if (!existing && context?.fallbackPhone) {
    existing = (await directoryService.findByPhone(context.fallbackPhone))[0] ?? null;
  }
  if (!existing) {
    existing = await directoryService.findByAppUserId(userId);
  }
  if (!existing && looksLikePhoneValue(userId)) {
    existing = (await directoryService.findByPhone(userId))[0] ?? null;
  }

  const phoneE164 = resolveContactPhoneForSave({
    payloadPhone: payload.phoneNumber,
    fallbackPhone: context?.fallbackPhone,
    existingEntryPhone: existing?.phone,
  });

  const name = payload.name?.trim() || payload.displayName?.trim() || undefined;
  const photoUrl = payload.photoUrl?.trim() || payload.photoURL?.trim() || undefined;
  const email = payload.email?.trim() || undefined;
  const notes = payload.bio?.trim() || undefined;
  const address = payload.address?.trim() || undefined;

  const metadataPatch: Record<string, unknown> = {};
  if (payload.department?.trim()) metadataPatch.department = payload.department.trim();
  if (payload.city?.trim()) metadataPatch.city = payload.city.trim();

  const mergedMetadata = {
    ...(existing?.metadata ?? {}),
    ...metadataPatch,
  };

  const patch: Partial<DirectoryEntry> = {
    phone: phoneE164,
    appUserId: userId,
    ...(name !== undefined ? { displayName: name, fullName: name } : {}),
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

  const phoneDigits = phoneE164.replace(/\D/g, '');
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

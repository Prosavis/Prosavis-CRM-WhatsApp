import { supabase } from '@/config/supabase';

export async function updateUserProfileViaFunction(
  payload: Record<string, string>,
  userId: string,
): Promise<{ success: boolean }> {
  const phoneDigits = (payload.phoneNumber ?? userId).replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    throw new Error('Teléfono inválido para actualizar perfil.');
  }

  const metadata: Record<string, string> = {};
  if (payload.department?.trim()) metadata.department = payload.department.trim();
  if (payload.city?.trim()) metadata.city = payload.city.trim();
  if (payload.bio?.trim()) metadata.bio = payload.bio.trim();

  const { error } = await supabase.from('crm_contact_profiles').upsert({
    phone: phoneDigits,
    user_id: userId,
    display_name: payload.name?.trim() || payload.displayName?.trim() || null,
    photo_url: payload.photoUrl?.trim() || payload.photoURL?.trim() || null,
    email: payload.email?.trim() || null,
    notes: payload.bio?.trim() || payload.address?.trim() || null,
    metadata,
  });

  if (error) throw error;

  const convPatch: Record<string, string | null> = {};
  const name = payload.name?.trim() || payload.displayName?.trim();
  if (name) convPatch.contact_name = name;
  if (payload.photoUrl?.trim()) convPatch.contact_photo_url = payload.photoUrl.trim();

  if (Object.keys(convPatch).length > 0) {
    const { error: convError } = await supabase
      .from('whatsapp_conversations')
      .update(convPatch)
      .eq('stable_key', phoneDigits);
    if (convError) throw convError;
  }

  return { success: true };
}

/**
 * Identidad estable del destinatario para preferencias de recordatorio 24h.
 */

import {
  isSentinelClientId,
  resolveDirectoryEntry,
} from './appointmentPhoneResolver.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type RecipientType = 'client' | 'professional';

export async function resolveRecipientKey(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
  recipientType: RecipientType,
): Promise<string | null> {
  if (recipientType === 'professional') {
    return String(data.teamMemberId ?? data.providerId ?? '').trim() || null;
  }

  const clientId = String(data.clientId ?? '').trim();
  const clientAppUserId = String(data.clientAppUserId ?? '').trim();

  if (clientId && !isSentinelClientId(clientId)) {
    const entry = await resolveDirectoryEntry(supabase, clientId);
    if (entry?.id) return entry.id;
  }

  if (clientAppUserId) {
    const { data: byAppUser, error } = await supabase
      .from('crm_directory')
      .select('id')
      .eq('app_user_id', clientAppUserId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (byAppUser?.id) return String(byAppUser.id);
    return clientAppUserId;
  }

  if (clientId && !isSentinelClientId(clientId)) {
    return clientId;
  }

  return null;
}

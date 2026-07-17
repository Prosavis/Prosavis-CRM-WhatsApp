/**
 * Sincroniza bloqueo del inbox → tag "Bloqueado" en crm_directory.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { directoryPhoneKey } from './directoryPhone.ts';

export const BLOCKED_TAG_NAME = 'Bloqueado';

async function ensureBlockedTagId(supabase: SupabaseClient): Promise<string | null> {
  const { data: existing } = await supabase
    .from('whatsapp_chat_tags')
    .select('id')
    .eq('name', BLOCKED_TAG_NAME)
    .eq('archived', false)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from('whatsapp_chat_tags')
    .insert({ name: BLOCKED_TAG_NAME, color: '#ef4444', archived: false })
    .select('id')
    .maybeSingle();

  if (error) {
    // Race: otro proceso creó el tag
    const { data: retry } = await supabase
      .from('whatsapp_chat_tags')
      .select('id')
      .eq('name', BLOCKED_TAG_NAME)
      .eq('archived', false)
      .maybeSingle();
    return (retry?.id as string | undefined) ?? null;
  }

  return (created?.id as string | undefined) ?? null;
}

/**
 * Asegura que los contactos del directorio ligados a estos teléfonos/claves
 * tengan el tag Bloqueado (merge con tags existentes).
 */
export async function applyBlockedTagToDirectory(
  supabase: SupabaseClient,
  keys: Iterable<string>,
  reasonNote?: string,
): Promise<number> {
  const blockedTagId = await ensureBlockedTagId(supabase);
  if (!blockedTagId) {
    console.error('[directoryBlocklistSync] No se pudo resolver tag Bloqueado');
    return 0;
  }

  const phoneKeys = new Set<string>();
  for (const raw of keys) {
    const pk = directoryPhoneKey(raw) ?? (raw.replace(/\D/g, '').slice(-10) || null);
    if (pk) phoneKeys.add(pk);
  }
  if (phoneKeys.size === 0) return 0;

  const { data: entries, error } = await supabase
    .from('crm_directory')
    .select('id,tags,internal_notes,phone_key')
    .in('phone_key', [...phoneKeys]);

  if (error) {
    console.error('[directoryBlocklistSync] directory lookup failed', error);
    return 0;
  }

  let updated = 0;
  for (const entry of entries ?? []) {
    const currentTags: string[] = Array.isArray(entry.tags)
      ? entry.tags.filter((t: unknown): t is string => typeof t === 'string')
      : [];

    // Resolver IDs de tags actuales + Bloqueado
    const { data: tagRows } = await supabase
      .from('whatsapp_chat_tags')
      .select('id,name')
      .in('name', [...new Set([...currentTags, BLOCKED_TAG_NAME])])
      .eq('archived', false);

    const tagIds = new Set<string>([blockedTagId]);
    for (const row of tagRows ?? []) {
      if (row?.id) tagIds.add(row.id as string);
    }

    const { error: rpcError } = await supabase.rpc('set_directory_classification_tags', {
      p_directory_id: entry.id,
      p_tag_ids: [...tagIds],
    });

    if (rpcError) {
      console.error('[directoryBlocklistSync] set tags failed', entry.id, rpcError);
      continue;
    }

    // Motivo: solo si no hay notas internas previas.
    const existingNotes =
      typeof entry.internal_notes === 'string' ? entry.internal_notes.trim() : '';
    if (!existingNotes && reasonNote) {
      await supabase
        .from('crm_directory')
        .update({ internal_notes: reasonNote })
        .eq('id', entry.id);
    }

    updated += 1;
  }

  return updated;
}

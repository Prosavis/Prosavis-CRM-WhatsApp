import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/config/supabase';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
} from '@/utils/directoryPhone';
import { normalizeWhatsAppPanelPhone } from '@/utils/whatsappPhone';
import type { WhatsAppConversation } from '@/services/whatsappService';

export interface DirectoryContactMeta {
  photoUrl?: string;
  displayName?: string;
  tags: string[];
  classification?: string;
}

export interface DirectoryContactMetaResult {
  metaByPhoneKey: Map<string, DirectoryContactMeta>;
  /** False hasta que el fetch del directorio termina (éxito o error). */
  ready: boolean;
}

function conversationPhone(conv: WhatsAppConversation): string | null {
  return normalizeWhatsAppPanelPhone(
    conv.phone ?? conv.contactPhone ?? conv.id,
  );
}

function buildLookupVariants(conversations: WhatsAppConversation[]): string[] {
  const variantSet = new Set<string>();
  for (const conv of conversations) {
    const phone = conversationPhone(conv);
    if (!phone) continue;
    for (const variant of directoryPhoneLookupVariants(phone)) {
      variantSet.add(variant);
    }
  }
  return [...variantSet].sort();
}

export function useDirectoryContactMeta(
  conversations: WhatsAppConversation[],
): DirectoryContactMetaResult {
  const lookupSignature = useMemo(() => {
    return buildLookupVariants(conversations).join('|');
  }, [conversations]);

  const query = useQuery({
    queryKey: inboxQueryKeys.directoryMeta(lookupSignature),
    enabled: Boolean(lookupSignature),
    staleTime: 30_000,
    queryFn: async () => {
      const variants = lookupSignature.split('|');
      const { data, error } = await supabase.rpc('crm_directory_meta_by_phones', {
        p_phones: variants,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        phone: string | null;
        phone_key: string | null;
        photo_url: string | null;
        display_name: string | null;
        full_name: string | null;
        tags: string[] | null;
        classification: string | null;
      }>;
      const next = new Map<string, DirectoryContactMeta>();
      for (const row of rows) {
        const key = row.phone_key?.trim() || directoryPhoneKey(row.phone) || null;
        if (!key) continue;
        const displayName = row.display_name?.trim() || row.full_name?.trim() || undefined;
        const photoUrl = row.photo_url?.trim() || undefined;
        const tags = (row.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
        const classification = row.classification?.trim() || undefined;
        const existing = next.get(key);
        if (!existing) {
          next.set(key, { displayName, photoUrl, tags, classification });
          continue;
        }
        const mergedTags = [...existing.tags];
        for (const tag of tags) {
          if (!mergedTags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
            mergedTags.push(tag);
          }
        }
        next.set(key, {
          displayName: existing.displayName || displayName,
          photoUrl: existing.photoUrl || photoUrl,
          tags: mergedTags,
          classification: existing.classification || classification,
        });
      }
      return next;
    },
  });

  return {
    metaByPhoneKey: query.data ?? new Map<string, DirectoryContactMeta>(),
    ready: !lookupSignature || query.isFetched || query.isError,
  };
}

export function getDirectoryMetaForConversation(
  conv: WhatsAppConversation,
  metaByPhoneKey: Map<string, DirectoryContactMeta>,
): DirectoryContactMeta | undefined {
  const phone = conversationPhone(conv);
  const key = directoryPhoneKey(phone);
  if (!key) return undefined;
  return metaByPhoneKey.get(key);
}

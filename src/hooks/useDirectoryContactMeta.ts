import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/config/supabase';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import {
  fetchDirectoryMetaByPhones,
  type DirectoryContactMeta,
  type DirectoryMetaSourceRow,
} from '@/utils/directoryContactMetaFetch';
import { directoryPhoneKey } from '@/utils/directoryPhone';
import { normalizeWhatsAppPanelPhone } from '@/utils/whatsappPhone';
import type { WhatsAppConversation } from '@/services/whatsappService';

export type { DirectoryContactMeta };

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

function buildLookupKeys(conversations: WhatsAppConversation[]): string[] {
  const keys = new Set<string>();
  for (const conv of conversations) {
    const key = directoryPhoneKey(conversationPhone(conv));
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

export function useDirectoryContactMeta(
  conversations: WhatsAppConversation[],
): DirectoryContactMetaResult {
  const lookupSignature = useMemo(() => {
    return buildLookupKeys(conversations).join('|');
  }, [conversations]);

  const query = useQuery({
    queryKey: inboxQueryKeys.directoryMeta(lookupSignature),
    enabled: Boolean(lookupSignature),
    staleTime: 30_000,
    queryFn: async () => {
      const keys = lookupSignature.split('|').filter(Boolean);
      return fetchDirectoryMetaByPhones(keys, async (phones) => {
        const { data, error } = await supabase.rpc('crm_directory_meta_by_phones', {
          p_phones: phones,
        });
        if (error) throw error;
        return (data ?? []) as DirectoryMetaSourceRow[];
      });
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
